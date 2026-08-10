import OpenAI from "openai";
import type { ZodTypeAny } from "zod";
import { logger } from "./logger";
import { FALLBACK_DEFAULT_MODEL } from "./llm-models";

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

const ENV_MODEL = process.env["LLM_MODEL"] ?? FALLBACK_DEFAULT_MODEL;
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = Number(
  process.env["LLM_REQUEST_TIMEOUT_MS"] ?? "20000",
);

if (!process.env["LLM_MODEL"] && liveCredentials()) {
  logger.warn(
    { defaultModel: ENV_MODEL },
    "LLM_MODEL env var not set; defaulting model. Operators can pick a model in the AgentOps settings UI, or set LLM_MODEL to pin one.",
  );
}

/**
 * Why a step fell back to the demo payload. `no_credentials` means we never
 * attempted a live call (true demo mode). All other reasons indicate a live
 * call that failed in some way.
 */
export type FallbackReason =
  | "no_credentials"
  | "empty_content"
  | "non_object"
  | "invalid_json"
  | "schema_validation"
  | "shape_mismatch"
  | "api_error";

export interface FallbackInfo {
  /** "demo" = no creds configured; "live" = live call attempted but failed. */
  mode: LlmMode;
  reason: FallbackReason;
  message: string;
}

/**
 * Usage metrics from one provider round-trip.
 * Present only when a live call was actually attempted (demo mode → undefined).
 * Token fields are null when the provider omits usage (rare but possible).
 */
export interface LlmUsage {
  provider: "openai";
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Wall-clock duration of the provider call in milliseconds. */
  durationMs: number;
}

export interface AgentOutputResult {
  details: Record<string, unknown>;
  fallback?: FallbackInfo;
  /**
   * Populated whenever a live LLM call was attempted, regardless of whether
   * it succeeded or fell back to the demo payload.
   * Undefined in true demo mode (no credentials).
   */
  usage?: LlmUsage;
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
  /**
   * Override the model used for this invocation. When omitted the env-var
   * default is used. Resolved per-agent via `lib/model-config` so operators
   * can tune cost vs. quality from the AgentOps settings UI.
   */
  model?: string;
}

export async function generateAgentOutput(
  invocation: AgentInvocation,
): Promise<AgentOutputResult> {
  const openai = getClient();
  if (!openai) {
    // Demo mode is the documented default — log at debug to keep normal
    // operation quiet. True live-call failures still log at warn below.
    logger.debug(
      { agentSlug: invocation.agentSlug },
      "LLM in demo mode: no credentials configured " +
        "(set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY for live mode)",
    );
    return {
      details: invocation.demoFallback,
      fallback: {
        mode: "demo",
        reason: "no_credentials",
        message:
          "Demo mode: no LLM credentials configured (set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY for live mode).",
      },
    };
  }

  const model = invocation.model ?? ENV_MODEL;
  const schemaHint = JSON.stringify(invocation.demoFallback, null, 2);
  const system = `${invocation.systemPrompt}

You MUST respond with a single JSON object that matches the SAME SHAPE as the example below
(keep every key, preserve types and units; numeric *Cents fields are integers; risk levels are
one of "low" | "medium" | "high" | "critical"; recommendedDecision is exactly one of
"approve" | "conditional_approve" | "reject" (use "conditional_approve" when
the deal can move forward only if specific blocking issues are remediated —
populate blockingIssues with those conditions); each entry in complianceChecks has a status of
"pass" | "review" | "flag" | "fail").
Do not wrap your response in markdown.

EXAMPLE SHAPE:
${schemaHint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const callStarted = Date.now();
  try {
    const completion = await openai.chat.completions.create(
      {
        model: model,
        max_completion_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: invocation.userPrompt },
        ],
      },
      { signal: controller.signal },
    );
    const durationMs = Date.now() - callStarted;
    // Capture real usage from the provider response.
    const usage: LlmUsage = {
      provider: "openai",
      model,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
      totalTokens: completion.usage?.total_tokens ?? null,
      durationMs,
    };

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: model },
        "LLM live call fell back to demo: empty content from model",
      );
      return liveFallback(
        invocation,
        "empty_content",
        `Live call to ${model} returned empty content; using demo payload.`,
        usage,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      logger.warn(
        { err: parseErr, agentSlug: invocation.agentSlug, model: model, raw },
        "LLM live call fell back to demo: response was not valid JSON",
      );
      return liveFallback(
        invocation,
        "invalid_json",
        `Live call to ${model} returned non-JSON content; using demo payload.`,
        usage,
      );
    }
    if (!isPlainObject(parsed)) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: model, raw },
        "LLM live call fell back to demo: response was not a JSON object",
      );
      return liveFallback(
        invocation,
        "non_object",
        `Live call to ${model} returned a non-object JSON value; using demo payload.`,
        usage,
      );
    }
    if (invocation.schema) {
      const partial = toDeepPartial(invocation.schema);
      const result = partial.safeParse(parsed);
      if (!result.success) {
        logger.warn(
          {
            agentSlug: invocation.agentSlug,
            model: model,
            raw,
            issues: result.error.issues,
          },
          "LLM live call fell back to demo: response failed Zod validation",
        );
        const issueSummary = result.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ");
        return liveFallback(
          invocation,
          "schema_validation",
          `Live call to ${model} failed schema validation (${issueSummary}); using demo payload.`,
          usage,
        );
      }
      logger.debug(
        { agentSlug: invocation.agentSlug, model: model },
        "LLM live call succeeded",
      );
      return {
        details: deepMerge(
          invocation.demoFallback,
          result.data as Record<string, unknown>,
        ),
        usage,
      };
    }
    if (!matchesShape(parsed, invocation.demoFallback)) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: model, raw },
        "LLM live call fell back to demo: response did not match expected shape",
      );
      return liveFallback(
        invocation,
        "shape_mismatch",
        `Live call to ${model} returned a payload that did not match the expected shape; using demo payload.`,
        usage,
      );
    }
    logger.debug(
      { agentSlug: invocation.agentSlug, model: model },
      "LLM live call succeeded",
    );
    return { details: deepMerge(invocation.demoFallback, parsed), usage };
  } catch (err) {
    const durationMs = Date.now() - callStarted;
    logger.warn(
      { err, agentSlug: invocation.agentSlug, model: model },
      "LLM live call fell back to demo: API, timeout, or parse error",
    );
    // Usage is unavailable on hard failures but we still record duration.
    const usage: LlmUsage = {
      provider: "openai",
      model,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      durationMs,
    };
    return liveFallback(
      invocation,
      "api_error",
      `Live call to ${model} failed (${err instanceof Error ? err.message : String(err)}); using demo payload.`,
      usage,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function liveFallback(
  invocation: AgentInvocation,
  reason: FallbackReason,
  message: string,
  usage?: LlmUsage,
): AgentOutputResult {
  return {
    details: invocation.demoFallback,
    fallback: { mode: "live", reason, message },
    usage,
  };
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
