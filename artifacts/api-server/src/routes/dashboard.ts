import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import {
  activityLogsTable,
  agentStepsTable,
  agentsTable,
  approvalRequestsTable,
  db,
  workflowRunsTable,
} from "@workspace/db";
import { serializeActivity } from "../lib/serializers";

type WorkflowStatusName =
  | "submitted"
  | "triaged"
  | "legal_review"
  | "finance_review"
  | "communications_draft"
  | "approval_pending"
  | "approved"
  | "rejected"
  | "finalized"
  | "failed";

const router: IRouter = Router();

const TERMINAL_STATUSES: WorkflowStatusName[] = ["finalized", "rejected", "failed"];
const ACTIVE_STATUSES: WorkflowStatusName[] = [
  "submitted",
  "triaged",
  "legal_review",
  "finance_review",
  "communications_draft",
  "approval_pending",
];

router.get("/dashboard/metrics", async (_req, res): Promise<void> => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const allWorkflows = await db.select().from(workflowRunsTable);
  const activeWorkflows = allWorkflows.filter((w) =>
    ACTIVE_STATUSES.includes(w.status),
  ).length;
  const completedWorkflows = allWorkflows.filter((w) =>
    TERMINAL_STATUSES.includes(w.status),
  ).length;

  const [{ pendingCount } = { pendingCount: 0 }] = await db
    .select({ pendingCount: sql<number>`cast(count(*) as int)` })
    .from(approvalRequestsTable)
    .where(eq(approvalRequestsTable.status, "pending"));

  const [{ todayCount } = { todayCount: 0 }] = await db
    .select({ todayCount: sql<number>`cast(count(*) as int)` })
    .from(agentStepsTable)
    .where(gte(agentStepsTable.createdAt, startOfToday));

  const [{ riskCount } = { riskCount: 0 }] = await db
    .select({ riskCount: sql<number>`cast(count(*) as int)` })
    .from(workflowRunsTable)
    .where(
      and(
        ne(workflowRunsTable.riskLevel, "low"),
        ne(workflowRunsTable.status, "finalized"),
      ),
    );

  const estimatedCostImpactCents = allWorkflows
    .filter((w) => !TERMINAL_STATUSES.includes(w.status) || w.status === "finalized")
    .reduce((sum, w) => sum + (w.estimatedCostCents ?? 0), 0);

  const breakdownRows = await db
    .select({
      status: workflowRunsTable.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(workflowRunsTable)
    .groupBy(workflowRunsTable.status);

  const recentActivity = await db
    .select()
    .from(activityLogsTable)
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(10);

  const agents = await db
    .select()
    .from(agentsTable)
    .orderBy(agentsTable.name);
  const agentHealth = await Promise.all(
    agents.map(async (a) => {
      const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(agentStepsTable)
        .where(eq(agentStepsTable.agentId, a.id));
      const [last] = await db
        .select()
        .from(activityLogsTable)
        .where(eq(activityLogsTable.actor, a.slug))
        .orderBy(desc(activityLogsTable.createdAt))
        .limit(1);
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        role: a.role,
        description: a.description,
        capabilities: a.capabilities,
        tools: a.tools,
        status: a.status,
        recentActionCount: Number(count) || 0,
        lastActiveAt: last?.createdAt ? last.createdAt.toISOString() : null,
      };
    }),
  );

  res.json({
    activeWorkflows,
    pendingApprovals: Number(pendingCount) || 0,
    agentActionsToday: Number(todayCount) || 0,
    complianceRisksFlagged: Number(riskCount) || 0,
    estimatedCostImpactCents,
    completedWorkflows,
    totalWorkflows: allWorkflows.length,
    statusBreakdown: breakdownRows.map((b) => ({
      status: b.status,
      count: Number(b.count) || 0,
    })),
    recentActivity: recentActivity.map(serializeActivity),
    agentHealth,
  });
});

export default router;
