import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { activityLogsTable, agentStepsTable, agentsTable, db } from "@workspace/db";

const router: IRouter = Router();

router.get("/agents", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.name);
  const out = await Promise.all(
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
  res.json(out);
});

export default router;
