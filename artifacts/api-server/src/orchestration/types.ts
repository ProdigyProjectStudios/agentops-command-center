import type { OperationalRequest, WorkflowRun } from "@workspace/db";
import type { AgentOutput, RiskLevel, WorkflowState } from "../lib/agents/types";

export type { AgentOutput, RiskLevel, WorkflowState };

export interface NodeContext {
  /**
   * The shared, mutable WorkflowState that flows across every node in the
   * pipeline (LangGraph-style). Nodes read upstream agent outputs from
   * `state.agentOutputs[stepName]` and may add their own once the engine
   * writes them in.
   */
  state: WorkflowState;
  workflowRun: WorkflowRun;
  request: OperationalRequest;
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
  /**
   * Uniform AgentOutput envelope, persisted as-is into agent_steps.output.
   * The agent-specific original payload lives under `output.details`.
   */
  output: AgentOutput;
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
  /** Stable key for indexing into WorkflowState.agentOutputs. */
  key: string;
  agentSlug: string;
  stepName: string;
  pendingStatus: string;
  run: (ctx: NodeContext) => Promise<NodeResult>;
}
