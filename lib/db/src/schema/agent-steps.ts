import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflowRunsTable } from "./workflow-runs";
import { agentsTable } from "./agents";
import { agentStepStatusEnum } from "./enums";

export const agentStepsTable = pgTable("agent_steps", {
  id: serial("id").primaryKey(),
  workflowRunId: integer("workflow_run_id")
    .notNull()
    .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "restrict" }),
  stepIndex: integer("step_index").notNull(),
  name: text("name").notNull(),
  status: agentStepStatusEnum("status").notNull().default("pending"),
  reasoningSummary: text("reasoning_summary"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb("output")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  toolsUsed: jsonb("tools_used").$type<string[]>().notNull().default([]),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  riskScore: text("risk_score"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAgentStepSchema = createInsertSchema(agentStepsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentStep = z.infer<typeof insertAgentStepSchema>;
export type AgentStep = typeof agentStepsTable.$inferSelect;
