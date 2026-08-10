/**
 * LLM usage telemetry — persistence and per-run aggregation.
 *
 * `persistTelemetry` is the write path; it is designed to be called
 * fire-and-forget from BaseAgent so telemetry failures can never propagate
 * to agent business logic.
 *
 * `getRunTelemetry` is the read path; it returns a structured summary of
 * all LLM calls recorded against a workflow run, grouped by agent.
 */

import { eq } from "drizzle-orm";
import { db, llmUsageTable } from "@workspace/db";
import { estimateCost } from "./llm-pricing";
import type { LlmUsage } from "./llm";
import { logger } from "./logger";

// ── Write ────────────────────────────────────────────────────────────────────

export interface TelemetryRecord {
  /** ID of the workflow run this call belongs to.  Omit for ad-hoc calls. */
  workflowRunId?: number;
  /** Agent that made the call. */
  agentSlug: string;
  /** Usage metrics returned by generateAgentOutput. */
  usage: LlmUsage;
  /**
   * Set when the agent fell back to its demo payload.
   * Matches FallbackReason from llm.ts.
   */
  fallbackReason?: string;
}

/**
 * Persist one LLM usage record.  Calculates estimated cost from the pricing
 * table and stores it alongside the raw token counts.
 *
 * Designed to be called fire-and-forget — the caller should `.catch()` and
 * log any error rather than awaiting.
 */
export async function persistTelemetry(record: TelemetryRecord): Promise<void> {
  const { usage } = record;

  // Estimate cost only when we have actual token counts from the provider.
  let estimatedCostMicros: number | null = null;
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    const cost = estimateCost(usage.model, usage.inputTokens, usage.outputTokens);
    estimatedCostMicros = cost.estimatedCostMicros;
  }

  await db.insert(llmUsageTable).values({
    workflowRunId: record.workflowRunId ?? null,
    agentSlug: record.agentSlug,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostMicros,
    durationMs: usage.durationMs,
    fallbackReason: record.fallbackReason ?? null,
  });
}

// ── Read / aggregation ───────────────────────────────────────────────────────

export interface AgentTelemetrySummary {
  agentSlug: string;
  model: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** NULL when any call for this agent used an unpriced model. */
  estimatedCostMicros: number | null;
  totalDurationMs: number;
}

export interface RunTelemetrySummary {
  workflowRunId: number;
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  /**
   * NULL when any call in the run used an unpriced model.
   * A non-null value is the sum of all individual call costs in microdollars.
   */
  totalEstimatedCostMicros: number | null;
  totalDurationMs: number;
  byAgent: AgentTelemetrySummary[];
}

/**
 * Fetch and aggregate all LLM usage records for a workflow run.
 *
 * Rows are aggregated by (agentSlug, model) so if the same agent used two
 * different models in the same run (unlikely but possible) they appear as
 * separate entries in `byAgent`.
 */
export async function getRunTelemetry(
  workflowRunId: number,
): Promise<RunTelemetrySummary> {
  const rows = await db
    .select()
    .from(llmUsageTable)
    .where(eq(llmUsageTable.workflowRunId, workflowRunId))
    .orderBy(llmUsageTable.createdAt);

  // Accumulators
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  // Start as 0; flip to null permanently the moment any row has no pricing.
  let totalEstimatedCostMicros: number | null = 0;
  let totalDurationMs = 0;

  const agentMap = new Map<string, AgentTelemetrySummary>();

  for (const row of rows) {
    const inputTokens = row.inputTokens ?? 0;
    const outputTokens = row.outputTokens ?? 0;
    const tokens = row.totalTokens ?? inputTokens + outputTokens;
    const costMicros = row.estimatedCostMicros ?? null;
    const durationMs = row.durationMs ?? 0;

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalTokens += tokens;
    totalDurationMs += durationMs;

    if (costMicros !== null && totalEstimatedCostMicros !== null) {
      totalEstimatedCostMicros += costMicros;
    } else {
      // Any unknown pricing poisons the total — mark permanently unknown.
      totalEstimatedCostMicros = null;
    }

    const key = `${row.agentSlug}:::${row.model}`;
    const existing = agentMap.get(key);
    if (existing) {
      existing.callCount += 1;
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += tokens;
      existing.totalDurationMs += durationMs;
      if (costMicros !== null && existing.estimatedCostMicros !== null) {
        existing.estimatedCostMicros += costMicros;
      } else {
        existing.estimatedCostMicros = null;
      }
    } else {
      agentMap.set(key, {
        agentSlug: row.agentSlug,
        model: row.model,
        callCount: 1,
        inputTokens,
        outputTokens,
        totalTokens: tokens,
        estimatedCostMicros: costMicros,
        totalDurationMs: durationMs,
      });
    }
  }

  return {
    workflowRunId,
    callCount: rows.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalEstimatedCostMicros,
    totalDurationMs,
    byAgent: Array.from(agentMap.values()),
  };
}

/**
 * Convenience helper: log a telemetry persist failure without re-throwing.
 * Intended for `.catch()` handlers in fire-and-forget call sites.
 */
export function logTelemetryError(err: unknown, agentSlug: string): void {
  logger.warn(
    { err, agentSlug },
    "LLM telemetry persist failed — agent output unaffected",
  );
}
