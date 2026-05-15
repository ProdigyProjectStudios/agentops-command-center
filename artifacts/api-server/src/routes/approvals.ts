import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  activityLogsTable,
  approvalRequestsTable,
  db,
  operationalRequestsTable,
  portfolioCompaniesTable,
  workflowRunsTable,
} from "@workspace/db";
import {
  ApproveApprovalBody,
  ListApprovalsQueryParams,
} from "@workspace/api-zod";
import { engine } from "../orchestration/engine";
import { serializeApproval } from "../lib/serializers";

const router: IRouter = Router();

async function loadCard(id: number) {
  const [row] = await db
    .select({
      approval: approvalRequestsTable,
      request: operationalRequestsTable,
      companyName: portfolioCompaniesTable.name,
    })
    .from(approvalRequestsTable)
    .innerJoin(
      workflowRunsTable,
      eq(approvalRequestsTable.workflowRunId, workflowRunsTable.id),
    )
    .innerJoin(
      operationalRequestsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .leftJoin(
      portfolioCompaniesTable,
      eq(operationalRequestsTable.portfolioCompanyId, portfolioCompaniesTable.id),
    )
    .where(eq(approvalRequestsTable.id, id));
  if (!row) return null;
  return serializeApproval(row.approval, row.request.title, row.companyName ?? "");
}

router.get("/approvals", async (req, res): Promise<void> => {
  const parsed = ListApprovalsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const baseQuery = db
    .select({
      approval: approvalRequestsTable,
      request: operationalRequestsTable,
      companyName: portfolioCompaniesTable.name,
    })
    .from(approvalRequestsTable)
    .innerJoin(
      workflowRunsTable,
      eq(approvalRequestsTable.workflowRunId, workflowRunsTable.id),
    )
    .innerJoin(
      operationalRequestsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .leftJoin(
      portfolioCompaniesTable,
      eq(operationalRequestsTable.portfolioCompanyId, portfolioCompaniesTable.id),
    );
  const rows = parsed.data.status
    ? await baseQuery
        .where(eq(approvalRequestsTable.status, parsed.data.status))
        .orderBy(desc(approvalRequestsTable.createdAt))
    : await baseQuery.orderBy(desc(approvalRequestsTable.createdAt));
  res.json(
    rows.map((r) =>
      serializeApproval(r.approval, r.request.title, r.companyName ?? ""),
    ),
  );
});

async function decide(
  id: number,
  newApprovalStatus: "approved" | "rejected" | "revision_requested",
  newWorkflowStatus: "approved" | "rejected" | "submitted",
  body: { decidedBy?: string; note?: string },
  actionLabel: string,
) {
  const [updated] = await db
    .update(approvalRequestsTable)
    .set({
      status: newApprovalStatus,
      decidedBy: body.decidedBy ?? "operator",
      decisionNote: body.note ?? null,
      decidedAt: new Date(),
    })
    .where(eq(approvalRequestsTable.id, id))
    .returning();
  if (!updated) return null;

  await db
    .update(workflowRunsTable)
    .set({
      status: newWorkflowStatus,
      currentStage: newWorkflowStatus,
    })
    .where(eq(workflowRunsTable.id, updated.workflowRunId));

  await db.insert(activityLogsTable).values({
    workflowRunId: updated.workflowRunId,
    actor: body.decidedBy ?? "operator",
    actorType: "user",
    action: actionLabel,
    message: `Operator ${actionLabel.replace("_", " ")} the workflow.`,
    metadata: body.note ? { note: body.note } : {},
  });

  if (newApprovalStatus === "approved" || newApprovalStatus === "rejected") {
    await engine.finalize(updated.workflowRunId);
  }
  return updated;
}

router.post("/approvals/:id/approve", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid approval id" });
    return;
  }
  const parsed = ApproveApprovalBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updated = await decide(id, "approved", "approved", parsed.data, "approved");
  if (!updated) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }
  const card = await loadCard(id);
  res.json(card);
});

router.post("/approvals/:id/reject", async (req, res): Promise<void> => {
  const id = Number(
    Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
  );
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid approval id" });
    return;
  }
  const parsed = ApproveApprovalBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updated = await decide(id, "rejected", "rejected", parsed.data, "rejected");
  if (!updated) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }
  const card = await loadCard(id);
  res.json(card);
});

router.post(
  "/approvals/:id/request-revision",
  async (req, res): Promise<void> => {
    const id = Number(
      Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"],
    );
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid approval id" });
      return;
    }
    const parsed = ApproveApprovalBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updated = await decide(
      id,
      "revision_requested",
      "submitted",
      parsed.data,
      "revision_requested",
    );
    if (!updated) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    const card = await loadCard(id);
    res.json(card);
  },
);

export default router;
