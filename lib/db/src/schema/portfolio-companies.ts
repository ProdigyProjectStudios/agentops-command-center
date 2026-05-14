import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portfolioCompaniesTable = pgTable("portfolio_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  industry: text("industry").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPortfolioCompanySchema = createInsertSchema(
  portfolioCompaniesTable,
).omit({ id: true, createdAt: true });
export type InsertPortfolioCompany = z.infer<
  typeof insertPortfolioCompanySchema
>;
export type PortfolioCompany = typeof portfolioCompaniesTable.$inferSelect;
