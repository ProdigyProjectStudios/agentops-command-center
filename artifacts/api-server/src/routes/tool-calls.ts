import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  agentStepsTable,
  agentsTable,
  db,
  operationalRequestsTable,
  toolCallsTable,
  workflowRunsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/tool-calls", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      tc: toolCallsTable,
      title: operationalRequestsTable.title,
      agentName: agentsTable.name,
    })
    .from(toolCallsTable)
    .innerJoin(
      workflowRunsTable,
      eq(toolCallsTable.workflowRunId, workflowRunsTable.id),
    )
    .innerJoin(
      operationalRequestsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .leftJoin(
      agentStepsTable,
      eq(toolCallsTable.agentStepId, agentStepsTable.id),
    )
    .leftJoin(agentsTable, eq(agentStepsTable.agentId, agentsTable.id))
    .orderBy(desc(toolCallsTable.createdAt))
    .limit(200);
  res.json(
    rows.map((r) => ({
      id: r.tc.id,
      workflowRunId: r.tc.workflowRunId,
      agentStepId: r.tc.agentStepId,
      toolName: r.tc.toolName,
      status: r.tc.status,
      input: r.tc.input,
      output: r.tc.output,
      outputSummary: r.tc.outputSummary,
      durationMs: r.tc.durationMs,
      createdAt: r.tc.createdAt.toISOString(),
      workflowTitle: r.title,
      agentName: r.agentName,
    })),
  );
});

export default router;
