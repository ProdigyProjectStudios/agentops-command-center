import type {
  OperationalRequest,
  PortfolioCompany,
  WorkflowRun,
} from "@workspace/db";
import { z } from "zod";

export const toolCallRequestSchema = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()),
  rationale: z.string().optional(),
});
export type ToolCallRequest = z.infer<typeof toolCallRequestSchema>;

export const fallbackInfoSchema = z.object({
  mode: z.enum(["demo", "live"]),
  reason: z.enum([
    "no_credentials",
    "empty_content",
    "non_object",
    "invalid_json",
    "schema_validation",
    "shape_mismatch",
    "api_error",
  ]),
  message: z.string(),
});
export type FallbackInfo = z.infer<typeof fallbackInfoSchema>;

export const agentOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(z.string()),
  risks: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  toolCallsRequested: z.array(toolCallRequestSchema),
  confidence: z.number().min(0).max(1),
  details: z.record(z.unknown()),
  /**
   * Set when the agent's `details` came from the deterministic demo fallback
   * instead of a successful live model response. `mode === "demo"` means no
   * credentials were configured (true demo run); `mode === "live"` means a
   * live call was attempted but failed validation, parsing, or the API call
   * itself, and the operator should investigate.
   */
  fallback: fallbackInfoSchema.optional(),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";

/** Tool-call result captured for the timeline (parallels tool_calls table). */
export interface RecordedToolCallResult {
  agentSlug: string;
  toolName: string;
  status: "success" | "failed" | "running";
  outputSummary: string;
  durationMs: number;
}

/** Lightweight memory hit shape stored on shared WorkflowState. */
export interface RetrievedMemoryItem {
  documentId: number;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

/**
 * Shared state that flows through every node in the LangGraph-style graph.
 * Nodes read from it (upstream context) and write into it (their own
 * AgentOutput, retrieved memory, tool-call results, risk flags). The engine
 * persists the durable parts back to workflow_runs / agent_steps so the
 * graph can be resumed mid-run.
 */
export interface WorkflowState {
  workflowRun: WorkflowRun;
  request: OperationalRequest;
  portfolioCompany?: PortfolioCompany;
  /** Current pipeline stage (mirrors workflow_runs.current_stage). */
  currentStage: string;
  /** AgentOutput envelope per node, keyed by NodeDefinition.key. */
  agentOutputs: Record<string, AgentOutput>;
  /** Knowledge-base hits surfaced by the memory_retrieval node. */
  retrievedMemory: RetrievedMemoryItem[];
  /** Tool-call results from every agent in execution order. */
  toolCallResults: RecordedToolCallResult[];
  /** Aggregated risk flags raised by upstream agents. */
  riskFlags: string[];
  /** Approval gate state — set by approval node / operator decision. */
  approvalStatus?: ApprovalStatus;
  /** Final synthesis summary surfaced to operators. */
  finalSummary?: string;
  /** Final next-actions list surfaced to operators. */
  finalNextActions: string[];
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
