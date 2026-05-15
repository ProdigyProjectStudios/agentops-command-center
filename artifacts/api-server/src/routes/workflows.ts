import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import {
  activityLogsTable,
  agentStepsTable,
  agentsTable,
  approvalRequestsTable,
  db,
  operationalRequestsTable,
  portfolioCompaniesTable,
  toolCallsTable,
  workflowRunsTable,
} from "@workspace/db";
import { engine } from "../orchestration/engine";
import {
  serializeActivity,
  serializeAgentStep,
  serializeApproval,
  serializeRequest,
  serializeToolCall,
  serializeWorkflowSummary,
} from "../lib/serializers";

const router: IRouter = Router();

async function loadDetail(workflowRunId: number) {
  const [row] = await db
    .select({
      workflow: workflowRunsTable,
      request: operationalRequestsTable,
      companyName: portfolioCompaniesTable.name,
    })
    .from(workflowRunsTable)
    .innerJoin(
      operationalRequestsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .leftJoin(
      portfolioCompaniesTable,
      eq(operationalRequestsTable.portfolioCompanyId, portfolioCompaniesTable.id),
    )
    .where(eq(workflowRunsTable.id, workflowRunId));
  if (!row) return null;

  const stepRows = await db
    .select({ step: agentStepsTable, agent: agentsTable })
    .from(agentStepsTable)
    .innerJoin(agentsTable, eq(agentStepsTable.agentId, agentsTable.id))
    .where(eq(agentStepsTable.workflowRunId, workflowRunId))
    .orderBy(asc(agentStepsTable.stepIndex));

  const toolCalls = await db
    .select()
    .from(toolCallsTable)
    .where(eq(toolCallsTable.workflowRunId, workflowRunId))
    .orderBy(asc(toolCallsTable.id));

  const activity = await db
    .select()
    .from(activityLogsTable)
    .where(eq(activityLogsTable.workflowRunId, workflowRunId))
    .orderBy(asc(activityLogsTable.id));

  const [approvalRow] = await db
    .select()
    .from(approvalRequestsTable)
    .where(eq(approvalRequestsTable.workflowRunId, workflowRunId))
    .orderBy(desc(approvalRequestsTable.id));

  const w = row.workflow;
  const r = row.request;
  return {
    id: w.id,
    request: serializeRequest(r, {
      portfolioCompanyName: row.companyName,
      workflowRunId: w.id,
    }),
    status: w.status,
    currentStage: w.currentStage,
    riskLevel: w.riskLevel,
    estimatedCostCents: w.estimatedCostCents,
    finalRecommendation: w.finalRecommendation,
    nextActions: w.nextActions,
    summary: w.summary,
    startedAt: w.startedAt ? w.startedAt.toISOString() : null,
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
    createdAt: w.createdAt.toISOString(),
    steps: stepRows.map((s) => serializeAgentStep(s.step, s.agent)),
    toolCalls: toolCalls.map(serializeToolCall),
    activity: activity.map(serializeActivity),
    approval: approvalRow
      ? serializeApproval(approvalRow, r.title, row.companyName ?? "")
      : null,
  };
}

router.get("/workflows", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      workflow: workflowRunsTable,
      request: operationalRequestsTable,
      companyName: portfolioCompaniesTable.name,
    })
    .from(workflowRunsTable)
    .innerJoin(
      operationalRequestsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .leftJoin(
      portfolioCompaniesTable,
      eq(operationalRequestsTable.portfolioCompanyId, portfolioCompaniesTable.id),
    )
    .orderBy(desc(workflowRunsTable.createdAt));
  res.json(
    rows.map((r) =>
      serializeWorkflowSummary(r.workflow, r.request, r.companyName ?? ""),
    ),
  );
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid workflow id" });
    return;
  }
  const detail = await loadDetail(id);
  if (!detail) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }
  res.json(detail);
});

router.post("/workflows/:id/run", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid workflow id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }
  await engine.run(id);
  const detail = await loadDetail(id);
  res.json(detail);
});

router.get("/workflows/:id/steps", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid workflow id" });
    return;
  }
  const stepRows = await db
    .select({ step: agentStepsTable, agent: agentsTable })
    .from(agentStepsTable)
    .innerJoin(agentsTable, eq(agentStepsTable.agentId, agentsTable.id))
    .where(eq(agentStepsTable.workflowRunId, id))
    .orderBy(asc(agentStepsTable.stepIndex));
  res.json(stepRows.map((s) => serializeAgentStep(s.step, s.agent)));
});

router.get("/workflows/:id/tool-calls", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid workflow id" });
    return;
  }
  const rows = await db
    .select()
    .from(toolCallsTable)
    .where(eq(toolCallsTable.workflowRunId, id))
    .orderBy(asc(toolCallsTable.id));
  res.json(rows.map(serializeToolCall));
});

router.get("/workflows/:id/activity", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid workflow id" });
    return;
  }
  const rows = await db
    .select()
    .from(activityLogsTable)
    .where(eq(activityLogsTable.workflowRunId, id))
    .orderBy(asc(activityLogsTable.id));
  res.json(rows.map(serializeActivity));
});

export default router;
