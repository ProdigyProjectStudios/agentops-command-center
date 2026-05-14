import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflowRunsTable } from "./workflow-runs";
import { approvalStatusEnum, riskLevelEnum } from "./enums";

export const approvalRequestsTable = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  workflowRunId: integer("workflow_run_id")
    .notNull()
    .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
  status: approvalStatusEnum("status").notNull().default("pending"),
  riskLevel: riskLevelEnum("risk_level").notNull().default("medium"),
  summary: text("summary").notNull(),
  recommendation: text("recommendation").notNull(),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertApprovalRequestSchema = createInsertSchema(
  approvalRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type ApprovalRequest = typeof approvalRequestsTable.$inferSelect;
