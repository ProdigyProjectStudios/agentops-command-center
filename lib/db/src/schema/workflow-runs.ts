import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { operationalRequestsTable } from "./operational-requests";
import { workflowStatusEnum, riskLevelEnum } from "./enums";

export const workflowRunsTable = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .references(() => operationalRequestsTable.id, { onDelete: "cascade" }),
  status: workflowStatusEnum("status").notNull().default("submitted"),
  currentStage: text("current_stage").notNull().default("submitted"),
  riskLevel: riskLevelEnum("risk_level").notNull().default("low"),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
  finalRecommendation: text("final_recommendation"),
  nextActions: jsonb("next_actions").$type<string[]>().notNull().default([]),
  summary: text("summary"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertWorkflowRunSchema = createInsertSchema(
  workflowRunsTable,
).omit({ id: true, createdAt: true });
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
