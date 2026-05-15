import { logger } from "./logger";

export type LlmMode = "demo" | "live";

export function getLlmMode(): LlmMode {
  return process.env["OPENAI_API_KEY"] ? "live" : "demo";
}

export function hasApiKey(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]);
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
  if (getLlmMode() === "demo") {
    return invocation.demoFallback;
  }
  logger.info(
    { agentSlug: invocation.agentSlug },
    "Live LLM provider not yet wired (Task #5); using demo output for this invocation",
  );
  return invocation.demoFallback;
}
