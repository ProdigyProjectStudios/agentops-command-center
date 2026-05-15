import type {
  ActivityLog,
  AgentStep,
  ApprovalRequest,
  OperationalRequest,
  PortfolioCompany,
  ToolCall,
  WorkflowRun,
} from "@workspace/db";

export function serializeCompany(c: PortfolioCompany) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

export function serializeRequest(
  r: OperationalRequest,
  extras: { portfolioCompanyName?: string | null; workflowRunId?: number | null } = {},
) {
  return {
    id: r.id,
    portfolioCompanyId: r.portfolioCompanyId,
    portfolioCompanyName: extras.portfolioCompanyName ?? null,
    title: r.title,
    description: r.description,
    department: r.department,
    priority: r.priority,
    requestedBy: r.requestedBy,
    createdAt: r.createdAt.toISOString(),
    workflowRunId: extras.workflowRunId ?? null,
  };
}

export function serializeWorkflowSummary(
  w: WorkflowRun,
  r: OperationalRequest,
  portfolioCompanyName: string,
) {
  return {
    id: w.id,
    requestId: w.requestId,
    title: r.title,
    status: w.status,
    currentStage: w.currentStage,
    riskLevel: w.riskLevel,
    estimatedCostCents: w.estimatedCostCents,
    portfolioCompanyName,
    department: r.department,
    priority: r.priority,
    startedAt: w.startedAt ? w.startedAt.toISOString() : null,
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
    createdAt: w.createdAt.toISOString(),
  };
}

export function serializeAgentStep(
  s: AgentStep,
  agent: { slug: string; name: string },
) {
  return {
    id: s.id,
    workflowRunId: s.workflowRunId,
    agentId: s.agentId,
    agentSlug: agent.slug,
    agentName: agent.name,
    stepIndex: s.stepIndex,
    name: s.name,
    status: s.status,
    reasoningSummary: s.reasoningSummary,
    input: s.input,
    output: s.output,
    toolsUsed: s.toolsUsed,
    confidence: s.confidence,
    riskScore: s.riskScore,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function serializeToolCall(t: ToolCall) {
  return {
    id: t.id,
    workflowRunId: t.workflowRunId,
    agentStepId: t.agentStepId,
    toolName: t.toolName,
    status: t.status,
    input: t.input,
    output: t.output,
    outputSummary: t.outputSummary,
    durationMs: t.durationMs,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeActivity(a: ActivityLog) {
  return {
    id: a.id,
    workflowRunId: a.workflowRunId,
    actor: a.actor,
    actorType: a.actorType,
    action: a.action,
    message: a.message,
    metadata: a.metadata,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeApproval(
  ap: ApprovalRequest,
  workflowTitle: string,
  portfolioCompanyName: string,
) {
  return {
    id: ap.id,
    workflowRunId: ap.workflowRunId,
    workflowTitle,
    portfolioCompanyName,
    status: ap.status,
    riskLevel: ap.riskLevel,
    summary: ap.summary,
    recommendation: ap.recommendation,
    decidedBy: ap.decidedBy,
    decisionNote: ap.decisionNote,
    decidedAt: ap.decidedAt ? ap.decidedAt.toISOString() : null,
    createdAt: ap.createdAt.toISOString(),
  };
}
