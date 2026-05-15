import type { AgentStep, OperationalRequest, WorkflowRun } from "@workspace/db";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface NodeContext {
  workflowRun: WorkflowRun;
  request: OperationalRequest;
  priorSteps: Map<string, AgentStep>;
  priorOutputs: Map<string, Record<string, unknown>>;
  /**
   * Output of the synthesis step, populated by the engine once the
   * synthesis node has executed. Downstream nodes (e.g. create-approval)
   * should prefer this over recomputing demo synthesis.
   */
  synthesisOutput?: Record<string, unknown>;
}

export interface RecordedToolCall {
  toolName: string;
  status: "success" | "failed" | "running";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  outputSummary: string;
  durationMs: number;
}

export interface RecordedActivity {
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NodeResult {
  output: Record<string, unknown>;
  reasoningSummary?: string;
  confidence?: string;
  riskScore?: string;
  toolCalls?: RecordedToolCall[];
  activity?: RecordedActivity[];
  estimatedCostCents?: number;
  riskLevel?: RiskLevel;
  toolsUsed?: string[];
}

export interface NodeDefinition {
  agentSlug: string;
  stepName: string;
  pendingStatus: string;
  run: (ctx: NodeContext) => Promise<NodeResult>;
}
