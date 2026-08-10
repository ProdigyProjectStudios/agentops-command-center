/**
 * llm_usage — lightweight LLM call telemetry table.
 *
 * One row per `generateAgentOutput` invocation that actually reached the
 * provider (demo mode / no-credentials runs do NOT insert a row).
 *
 * Cost is stored as integer microdollars (USD × 1,000,000) so that even
 * sub-cent charges are recorded without floating-point drift.  A NULL
 * estimated_cost_micros means pricing is not configured for that model —
 * not that the cost was zero.
 *
 * Owned by Drizzle / Node; pushed via `pnpm --filter @workspace/db push`.
 */
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { workflowRunsTable } from "./workflow-runs";

export const llmUsageTable = pgTable("llm_usage", {
  id: serial("id").primaryKey(),

  /** The workflow run this LLM call belongs to. NULL only if called outside
   *  an active workflow (e.g. ad-hoc tooling). */
  workflowRunId: integer("workflow_run_id").references(
    () => workflowRunsTable.id,
    { onDelete: "cascade" },
  ),

  /** The agent that made the call (matches agents.slug). */
  agentSlug: text("agent_slug").notNull(),

  /** LLM provider identifier. Always "openai" for now. */
  provider: text("provider").notNull().default("openai"),

  /** Resolved model string passed to the API (e.g. "gpt-4.1-mini"). */
  model: text("model").notNull(),

  /** Tokens from completion.usage.prompt_tokens.  NULL if provider omits usage. */
  inputTokens: integer("input_tokens"),

  /** Tokens from completion.usage.completion_tokens.  NULL if provider omits usage. */
  outputTokens: integer("output_tokens"),

  /** Tokens from completion.usage.total_tokens.  NULL if provider omits usage. */
  totalTokens: integer("total_tokens"),

  /** Estimated cost in microdollars (USD × 1e6) from the pricing table.
   *  NULL when model pricing is not configured. */
  estimatedCostMicros: integer("estimated_cost_micros"),

  /** Wall-clock duration of the provider round-trip in milliseconds. */
  durationMs: integer("duration_ms"),

  /** Populated when the agent fell back to its demo payload.
   *  Matches FallbackReason: "no_credentials" | "empty_content" | etc.
   *  NULL means the live response was accepted. */
  fallbackReason: text("fallback_reason"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LlmUsageRow = typeof llmUsageTable.$inferSelect;
export type InsertLlmUsage = typeof llmUsageTable.$inferInsert;
