import type { OperationalRequest, WorkflowRun } from "@workspace/db";
import { z } from "zod";

export const toolCallRequestSchema = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()),
  rationale: z.string().optional(),
});
export type ToolCallRequest = z.infer<typeof toolCallRequestSchema>;

export const agentOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(z.string()),
  risks: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  toolCallsRequested: z.array(toolCallRequestSchema),
  confidence: z.number().min(0).max(1),
  details: z.record(z.unknown()),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface WorkflowState {
  workflowRun: WorkflowRun;
  request: OperationalRequest;
  agentOutputs: Record<string, AgentOutput>;
  metadata: {
    startedAt: Date;
    estimatedCostCents?: number;
    riskLevel?: RiskLevel;
  };
}

export function emptyAgentOutput(): AgentOutput {
  return {
    summary: "",
    findings: [],
    risks: [],
    recommendedActions: [],
    toolCallsRequested: [],
    confidence: 0,
    details: {},
  };
}

export function isAgentOutput(v: unknown): v is AgentOutput {
  return agentOutputSchema.safeParse(v).success;
}

export function getAgentOutput(
  state: WorkflowState,
  key: string,
): AgentOutput | undefined {
  return state.agentOutputs[key];
}

export function parseConfidence(raw: unknown, fallback = 0.9): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, raw));
  }
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  }
  return fallback;
}
