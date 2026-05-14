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
import { workflowRunsTable } from "./workflow-runs";
import { agentStepsTable } from "./agent-steps";
import { toolCallStatusEnum } from "./enums";

export const toolCallsTable = pgTable("tool_calls", {
  id: serial("id").primaryKey(),
  workflowRunId: integer("workflow_run_id")
    .notNull()
    .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
  agentStepId: integer("agent_step_id").references(() => agentStepsTable.id, {
    onDelete: "set null",
  }),
  toolName: text("tool_name").notNull(),
  status: toolCallStatusEnum("status").notNull().default("success"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb("output")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  outputSummary: text("output_summary").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertToolCallSchema = createInsertSchema(toolCallsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertToolCall = z.infer<typeof insertToolCallSchema>;
export type ToolCall = typeof toolCallsTable.$inferSelect;
