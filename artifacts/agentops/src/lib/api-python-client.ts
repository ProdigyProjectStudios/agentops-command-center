/**
 * TypeScript client generated from AgentOps Python API — OpenAPI 1.0.0
 *
 * Source schema: GET /api-python/openapi.json
 * Endpoints covered:
 *   GET  /api-python/healthz
 *   POST /api-python/intake
 *   POST /api-python/triage/{workflow_id}
 *   POST /api-python/assess/{workflow_id}
 *   GET  /api-python/workflow/{workflow_id}
 *   GET  /api-python/pipeline-state/{workflow_id}  ← RAG panel endpoint
 *
 * All types match the Pydantic models in api-python/models.py and the
 * additional models added to api-python/main.py for pipeline-state.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Fetch utility
// ---------------------------------------------------------------------------

const API_BASE = "/api-python";

class ApiPythonError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiPythonError";
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.error === "string"
          ? body.error
          : `HTTP ${res.status} ${res.statusText}`;
    throw new ApiPythonError(res.status, detail);
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Schema types (mirrors api-python/models.py + pipeline-state additions)
// ---------------------------------------------------------------------------

export type WorkflowPriority = "low" | "medium" | "high" | "critical";

export interface IntakeRequest {
  title: string;
  description: string;
  department: string;
  priority: WorkflowPriority;
  requested_by: string;
  portfolio_company_id: number;
  request_type?: string;
}

export interface IntakeResponse {
  workflow_run_id: number;
  operational_request_id: number;
  status: string;
  current_stage: string;
  portfolio_company_id: number;
  title: string;
  department: string;
  priority: WorkflowPriority;
  requested_by: string;
  created_at: string;
}

export interface TriageBody {
  request_type?: string;
}

export interface TriageResponse {
  workflow_run_id: number;
  status: string;
  current_stage: string;
  risk_level: string;
  reviewer_tag: string;
  routing_rationale: string;
}

export interface AssessmentVerdict {
  recommendation: string;
  confidence: number;
  risks: string[];
  evidence_references: string[];
  next_actions: string[];
}

export interface AssessmentResponse {
  assessment_id: number;
  workflow_run_id: number;
  routing: "auto_complete" | "approval_gate";
  verdict: AssessmentVerdict;
  retrieval_mode: string;
  retrieval_chunks_used: number;
  approval_request_id: number | null;
  workflow_status: string;
}

export interface AgentStepSummary {
  id: number;
  name: string;
  status: string;
  step_index: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface ToolCallSummary {
  id: number;
  tool_name: string;
  status: string;
  output_summary: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface WorkflowStateResponse {
  workflow_run_id: number;
  operational_request_id: number;
  title: string;
  description: string;
  department: string;
  priority: WorkflowPriority;
  requested_by: string;
  portfolio_company_id: number;
  status: string;
  current_stage: string;
  risk_level: string;
  estimated_cost_cents: number | null;
  final_recommendation: string | null;
  summary: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  agent_steps: AgentStepSummary[];
  tool_calls: ToolCallSummary[];
}

// Pipeline-state types (GET /pipeline-state/{workflow_id})
export interface AssessmentSummary {
  id: number;
  confidence: number;
  routing: "auto_complete" | "approval_gate";
  retrieval_mode: string;
  retrieval_chunks_used: number;
  evidence_refs: string[];
  next_actions: string[];
  risks: string[];
  recommendation: string;
  created_at: string;
}

export interface ApprovalSummary {
  id: number;
  status: "pending" | "approved" | "rejected";
  risk_level: string;
  summary: string;
  recommendation: string;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface JobSummary {
  id: number;
  workflow: string;
  stage: string;
  status: "pending" | "running" | "done" | "failed";
  attempt_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface PipelineStateResponse {
  workflow_run_id: number;
  workflow_status: string;
  assessment_count: number;
  latest_assessment: AssessmentSummary | null;
  approval_request: ApprovalSummary | null;
  jobs: JobSummary[];
}

// ---------------------------------------------------------------------------
// Raw API calls
// ---------------------------------------------------------------------------

export const apiPython = {
  healthz: () => apiFetch<{ status: string }>("/healthz"),

  intake: (body: IntakeRequest) =>
    apiFetch<IntakeResponse>("/intake", { method: "POST", body: JSON.stringify(body) }),

  triage: (workflowId: number, body: TriageBody = {}) =>
    apiFetch<TriageResponse>(`/triage/${workflowId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assess: (workflowId: number, confidenceThreshold?: number) => {
    const qs =
      confidenceThreshold !== undefined
        ? `?confidence_threshold=${confidenceThreshold}`
        : "";
    return apiFetch<AssessmentResponse>(`/assess/${workflowId}${qs}`, { method: "POST" });
  },

  getWorkflow: (workflowId: number) =>
    apiFetch<WorkflowStateResponse>(`/workflow/${workflowId}`),

  getPipelineState: (workflowId: number) =>
    apiFetch<PipelineStateResponse>(`/pipeline-state/${workflowId}`),
};

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

export function useRagPipelineState(
  workflowId: number,
  options?: Omit<UseQueryOptions<PipelineStateResponse>, "queryKey" | "queryFn">,
) {
  return useQuery<PipelineStateResponse>({
    queryKey: ["api-python", "pipeline-state", workflowId],
    queryFn: () => apiPython.getPipelineState(workflowId),
    enabled: Number.isFinite(workflowId) && workflowId > 0,
    staleTime: 15_000,
    retry: 1,
    ...options,
  });
}

export function useApiPythonWorkflow(
  workflowId: number,
  options?: Omit<UseQueryOptions<WorkflowStateResponse>, "queryKey" | "queryFn">,
) {
  return useQuery<WorkflowStateResponse>({
    queryKey: ["api-python", "workflow", workflowId],
    queryFn: () => apiPython.getWorkflow(workflowId),
    enabled: Number.isFinite(workflowId) && workflowId > 0,
    staleTime: 15_000,
    retry: 1,
    ...options,
  });
}
