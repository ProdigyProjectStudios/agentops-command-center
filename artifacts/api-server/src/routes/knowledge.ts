import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, knowledgeDocumentsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { callWorker, PROXY_ERROR_BODY } from "./worker";

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

router.post("/knowledge/search", async (req, res): Promise<void> => {
  const { query, limit } = req.body as { query?: unknown; limit?: unknown };
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    res.status(400).json({ error: "query_required" });
    return;
  }
  try {
    const result = await callWorker("/worker/memory/search-spike", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: query.trim(),
        limit: typeof limit === "number" && limit > 0 && limit <= 20 ? limit : 5,
      }),
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.warn({ err }, "Knowledge search proxy failed");
    res.status(502).json(PROXY_ERROR_BODY);
  }
});

router.post("/knowledge/:documentId/embed", async (req, res): Promise<void> => {
  const docId = Number(req.params.documentId);
  if (!Number.isFinite(docId) || docId <= 0) {
    res.status(400).json({ error: "invalid_document_id" });
    return;
  }
  const rows = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.id, docId));
  if (rows.length === 0) {
    res.status(404).json({ error: "document_not_found" });
    return;
  }
  const doc = rows[0]!;
  try {
    const result = await callWorker("/worker/memory/embed-document", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        documentId: doc.id,
        content: doc.content,
        title: doc.title,
      }),
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.warn({ err, docId }, "Knowledge embed proxy failed");
    res.status(502).json(PROXY_ERROR_BODY);
  }
});

export default router;
