import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  operationalRequestsTable,
  portfolioCompaniesTable,
  workflowRunsTable,
} from "@workspace/db";
import { CreateRequestBody, GetRequestParams } from "@workspace/api-zod";
import { serializeRequest } from "../lib/serializers";

const router: IRouter = Router();

router.get("/requests", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      request: operationalRequestsTable,
      companyName: portfolioCompaniesTable.name,
      workflowRunId: workflowRunsTable.id,
    })
    .from(operationalRequestsTable)
    .leftJoin(
      portfolioCompaniesTable,
      eq(operationalRequestsTable.portfolioCompanyId, portfolioCompaniesTable.id),
    )
    .leftJoin(
      workflowRunsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .orderBy(desc(operationalRequestsTable.createdAt));
  res.json(
    rows.map((r) =>
      serializeRequest(r.request, {
        portfolioCompanyName: r.companyName,
        workflowRunId: r.workflowRunId,
      }),
    ),
  );
});

router.post("/requests", async (req, res): Promise<void> => {
  const parsed = CreateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [request] = await db
    .insert(operationalRequestsTable)
    .values(parsed.data)
    .returning();
  if (!request) {
    res.status(500).json({ error: "Failed to create request" });
    return;
  }
  const [workflowRun] = await db
    .insert(workflowRunsTable)
    .values({
      requestId: request.id,
      status: "submitted",
      currentStage: "submitted",
    })
    .returning();
  const [company] = await db
    .select()
    .from(portfolioCompaniesTable)
    .where(eq(portfolioCompaniesTable.id, request.portfolioCompanyId));
  res.status(201).json({
    request: serializeRequest(request, {
      portfolioCompanyName: company?.name ?? null,
      workflowRunId: workflowRun?.id ?? null,
    }),
    workflowRunId: workflowRun!.id,
  });
});

router.get("/requests/:id", async (req, res): Promise<void> => {
  const params = GetRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({
      request: operationalRequestsTable,
      companyName: portfolioCompaniesTable.name,
      workflowRunId: workflowRunsTable.id,
    })
    .from(operationalRequestsTable)
    .leftJoin(
      portfolioCompaniesTable,
      eq(operationalRequestsTable.portfolioCompanyId, portfolioCompaniesTable.id),
    )
    .leftJoin(
      workflowRunsTable,
      eq(workflowRunsTable.requestId, operationalRequestsTable.id),
    )
    .where(eq(operationalRequestsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json(
    serializeRequest(row.request, {
      portfolioCompanyName: row.companyName,
      workflowRunId: row.workflowRunId,
    }),
  );
});

export default router;
