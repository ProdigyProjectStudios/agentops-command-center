import type { ZodTypeAny } from "zod";
import { generateAgentOutput, type AgentInvocation } from "../llm";
import type { AgentOutput, ToolCallRequest } from "./types";
import { parseConfidence } from "./types";

export interface AgentEnvelope {
  summary: string;
  findings: string[];
  risks: string[];
  recommendedActions: string[];
  toolCallsRequested?: ToolCallRequest[];
  confidence: number;
}

export interface BaseAgentConfig<TDetails extends Record<string, unknown>> {
  agentSlug: string;
  agentName: string;
  systemPrompt: string;
  detailsSchema: ZodTypeAny;
  demoDetails: TDetails;
  /**
   * Project the (possibly LLM-augmented) details object into the uniform
   * AgentOutput envelope. Called after generateAgentOutput resolves.
   */
  buildEnvelope: (details: TDetails) => AgentEnvelope;
}

/**
 * runAgent is the BaseAgent abstraction every node uses to talk to the LLM.
 * It guarantees that every agent_steps.output row in the database conforms to
 * the AgentOutput contract regardless of which underlying agent produced it.
 */
export async function runAgent<TDetails extends Record<string, unknown>>(
  cfg: BaseAgentConfig<TDetails>,
  userPrompt: string,
): Promise<AgentOutput> {
  const invocation: AgentInvocation = {
    agentSlug: cfg.agentSlug,
    agentName: cfg.agentName,
    systemPrompt: cfg.systemPrompt,
    userPrompt,
    demoFallback: cfg.demoDetails,
    schema: cfg.detailsSchema,
  };
  const details = (await generateAgentOutput(invocation)) as TDetails;
  const env = cfg.buildEnvelope(details);
  return {
    summary: env.summary,
    findings: env.findings,
    risks: env.risks,
    recommendedActions: env.recommendedActions,
    toolCallsRequested: env.toolCallsRequested ?? [],
    confidence: parseConfidence(env.confidence),
    details,
  };
}
