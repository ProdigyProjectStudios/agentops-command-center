import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, knowledgeDocumentsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/knowledge", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(knowledgeDocumentsTable)
    .orderBy(desc(knowledgeDocumentsTable.updatedAt));
  res.json(
    rows.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      summary: d.summary,
      content: d.content,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  );
});

export default router;
