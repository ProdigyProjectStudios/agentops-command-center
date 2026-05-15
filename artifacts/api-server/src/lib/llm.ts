import OpenAI from "openai";
import type { ZodTypeAny } from "zod";
import { logger } from "./logger";

export type LlmMode = "demo" | "live";

const REPLIT_BASE_URL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const REPLIT_KEY = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const USER_KEY = process.env["OPENAI_API_KEY"];

function liveCredentials(): { apiKey: string; baseURL?: string } | null {
  if (REPLIT_BASE_URL && REPLIT_KEY) {
    return { apiKey: REPLIT_KEY, baseURL: REPLIT_BASE_URL };
  }
  if (USER_KEY) return { apiKey: USER_KEY };
  return null;
}

export function getLlmMode(): LlmMode {
  return liveCredentials() ? "live" : "demo";
}

export function hasApiKey(): boolean {
  return Boolean(liveCredentials());
}

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (client) return client;
  const creds = liveCredentials();
  if (!creds) return null;
  client = new OpenAI(creds);
  return client;
}

const MODEL = process.env["LLM_MODEL"] ?? "gpt-4o-mini";
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = Number(
  process.env["LLM_REQUEST_TIMEOUT_MS"] ?? "20000",
);

if (!process.env["LLM_MODEL"] && liveCredentials()) {
  logger.warn(
    { defaultModel: MODEL },
    "LLM_MODEL env var not set; defaulting model. Set LLM_MODEL to pin a specific model.",
  );
}

export interface AgentInvocation {
  agentSlug: string;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  demoFallback: Record<string, unknown>;
  /**
   * Zod schema describing the full expected output shape. The model response
   * is validated against `schema.deepPartial()` so partial responses are
   * accepted (and any missing keys are filled in via deep-merge from the
   * demo fallback). Validation failures fall back to the demo output.
   */
  schema?: ZodTypeAny;
}

export async function generateAgentOutput(
  invocation: AgentInvocation,
): Promise<Record<string, unknown>> {
  const openai = getClient();
  if (!openai) {
    // Demo mode is the documented default — log at debug to keep normal
    // operation quiet. True live-call failures still log at warn below.
    logger.debug(
      { agentSlug: invocation.agentSlug },
      "LLM in demo mode: no credentials configured " +
        "(set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY for live mode)",
    );
    return invocation.demoFallback;
  }

  const schemaHint = JSON.stringify(invocation.demoFallback, null, 2);
  const system = `${invocation.systemPrompt}

You MUST respond with a single JSON object that matches the SAME SHAPE as the example below
(keep every key, preserve types and units; numeric *Cents fields are integers; risk levels are
one of "low" | "medium" | "high" | "critical"; recommendedDecision is exactly
"approve" or "reject"; each entry in complianceChecks has a status of
"pass" | "review" | "flag" | "fail").
Do not wrap your response in markdown.

EXAMPLE SHAPE:
${schemaHint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const completion = await openai.chat.completions.create(
      {
        model: MODEL,
        max_completion_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: invocation.userPrompt },
        ],
      },
      { signal: controller.signal },
    );
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: MODEL },
        "LLM live call fell back to demo: empty content from model",
      );
      return invocation.demoFallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: MODEL, raw },
        "LLM live call fell back to demo: response was not a JSON object",
      );
      return invocation.demoFallback;
    }
    if (invocation.schema) {
      const partial = toDeepPartial(invocation.schema);
      const result = partial.safeParse(parsed);
      if (!result.success) {
        logger.warn(
          {
            agentSlug: invocation.agentSlug,
            model: MODEL,
            raw,
            issues: result.error.issues,
          },
          "LLM live call fell back to demo: response failed Zod validation",
        );
        return invocation.demoFallback;
      }
      logger.debug(
        { agentSlug: invocation.agentSlug, model: MODEL },
        "LLM live call succeeded",
      );
      return deepMerge(
        invocation.demoFallback,
        result.data as Record<string, unknown>,
      );
    }
    if (!matchesShape(parsed, invocation.demoFallback)) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: MODEL, raw },
        "LLM live call fell back to demo: response did not match expected shape",
      );
      return invocation.demoFallback;
    }
    logger.debug(
      { agentSlug: invocation.agentSlug, model: MODEL },
      "LLM live call succeeded",
    );
    return deepMerge(invocation.demoFallback, parsed);
  } catch (err) {
    logger.warn(
      { err, agentSlug: invocation.agentSlug, model: MODEL },
      "LLM live call fell back to demo: API, timeout, or parse error",
    );
    return invocation.demoFallback;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convert a schema into one that accepts partial responses. We accept any
 * subset of keys at any depth (zod's `.deepPartial()` for objects); arrays
 * and primitive schemas are passed through unchanged. The validated result
 * is then deep-merged onto the demo fallback so missing keys fall back
 * rather than disappear.
 */
function toDeepPartial(schema: ZodTypeAny): ZodTypeAny {
  const maybeDeepPartial = (
    schema as unknown as { deepPartial?: () => ZodTypeAny }
  ).deepPartial;
  if (typeof maybeDeepPartial === "function") {
    return maybeDeepPartial.call(schema);
  }
  return schema;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Lightweight runtime shape check. For every key the model DID return we
 * verify the type is compatible with the demo fallback:
 *   - primitives must match `typeof`
 *   - arrays must be arrays (element types are not enforced — LLM outputs
 *     legitimately produce variable array contents)
 *   - nested plain objects are validated recursively
 * Missing keys are tolerated and will be backfilled from `demoFallback` via
 * `deepMerge`, so partial-but-valid responses keep their LLM contribution
 * instead of being discarded wholesale.
 */
function matchesShape(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) continue;
    const want = expected[key];
    const got = actual[key];
    if (want === null || got === null) continue;
    if (Array.isArray(want)) {
      if (!Array.isArray(got)) return false;
      continue;
    }
    if (isPlainObject(want)) {
      if (!isPlainObject(got)) return false;
      if (!matchesShape(got, want)) return false;
      continue;
    }
    if (typeof want !== typeof got) return false;
  }
  return true;
}

/**
 * Recursively merge `override` over `base`. For nested objects, missing keys
 * in `override` fall back to `base` so a partial LLM response never zeroes
 * out demo values.
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      out[key] = deepMerge(baseValue, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
