import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { portfolioCompaniesTable } from "./portfolio-companies";
import { priorityEnum } from "./enums";

export const operationalRequestsTable = pgTable("operational_requests", {
  id: serial("id").primaryKey(),
  portfolioCompanyId: integer("portfolio_company_id")
    .notNull()
    .references(() => portfolioCompaniesTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  department: text("department").notNull(),
  priority: priorityEnum("priority").notNull().default("medium"),
  requestedBy: text("requested_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertOperationalRequestSchema = createInsertSchema(
  operationalRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertOperationalRequest = z.infer<
  typeof insertOperationalRequestSchema
>;
export type OperationalRequest = typeof operationalRequestsTable.$inferSelect;
