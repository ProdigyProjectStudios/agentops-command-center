import OpenAI from "openai";
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
}

export async function generateAgentOutput(
  invocation: AgentInvocation,
): Promise<Record<string, unknown>> {
  const openai = getClient();
  if (!openai) {
    logger.warn(
      { agentSlug: invocation.agentSlug },
      "LLM live call fell back to demo: no credentials configured " +
        "(set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY)",
    );
    return invocation.demoFallback;
  }

  const schemaHint = JSON.stringify(invocation.demoFallback, null, 2);
  const system = `${invocation.systemPrompt}

You MUST respond with a single JSON object that matches the SAME SHAPE as the example below
(keep every key, preserve types and units; numeric *Cents fields are integers; risk levels are
one of "low" | "medium" | "high" | "critical"). Do not wrap your response in markdown.

EXAMPLE SHAPE:
${schemaHint}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: invocation.userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      logger.warn(
        { agentSlug: invocation.agentSlug, model: MODEL },
        "LLM live call fell back to demo: empty content from model",
      );
      return invocation.demoFallback;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    logger.debug(
      { agentSlug: invocation.agentSlug, model: MODEL },
      "LLM live call succeeded",
    );
    return { ...invocation.demoFallback, ...parsed };
  } catch (err) {
    logger.warn(
      { err, agentSlug: invocation.agentSlug, model: MODEL },
      "LLM live call fell back to demo: API or parse error",
    );
    return invocation.demoFallback;
  }
}
