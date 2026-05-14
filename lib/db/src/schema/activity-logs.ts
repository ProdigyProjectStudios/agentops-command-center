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

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  workflowRunId: integer("workflow_run_id").references(
    () => workflowRunsTable.id,
    { onDelete: "cascade" },
  ),
  actor: text("actor").notNull(),
  actorType: text("actor_type").notNull().default("agent"),
  action: text("action").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(
  activityLogsTable,
).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogsTable.$inferSelect;
