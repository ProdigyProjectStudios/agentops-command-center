import { Router, type IRouter } from "express";
import { db, portfolioCompaniesTable } from "@workspace/db";
import { CreateCompanyBody } from "@workspace/api-zod";
import { serializeCompany } from "../lib/serializers";

const router: IRouter = Router();

router.get("/companies", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(portfolioCompaniesTable)
    .orderBy(portfolioCompaniesTable.name);
  res.json(rows.map(serializeCompany));
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(portfolioCompaniesTable)
    .values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      industry: parsed.data.industry,
      description: parsed.data.description ?? "",
    })
    .returning();
  if (!row) {
    res.status(500).json({ error: "Failed to create company" });
    return;
  }
  res.status(201).json(serializeCompany(row));
});

export default router;
