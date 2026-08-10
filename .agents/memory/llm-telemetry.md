---
name: LLM telemetry architecture
description: How LLM usage cost and token telemetry is captured, stored, and aggregated (Task 3).
---

## Key files
- `artifacts/api-server/src/lib/llm-pricing.ts` — centralized pricing table (4 known models), `estimateCost()` returns microdollars or null. Never throws.
- `artifacts/api-server/src/lib/telemetry.ts` — `persistTelemetry(record)` write path; `getRunTelemetry(workflowRunId)` aggregation.
- `lib/db/src/schema/llm-usage.ts` — Drizzle table `llm_usage` (pushed to DB). Cost in integer microdollars (USD × 1e6).
- `artifacts/api-server/src/lib/llm.ts` — `LlmUsage` type exported; `AgentOutputResult.usage?: LlmUsage` added. Usage captured on ALL live paths including fallbacks; undefined only in demo mode (no credentials).
- `artifacts/api-server/src/lib/agents/base-agent.ts` — fire-and-forget `persistTelemetry` after `generateAgentOutput`; `.catch(logTelemetryError)` never propagates.

## Rules
**Why:** Telemetry failures must never break agent business logic. Always wrap persist in `.catch()`.

**How to apply:** Any new agent that inherits `BaseAgent` gets telemetry automatically via `base-agent.ts`.

**Cost NULL vs 0:** `estimatedCostMicros: null` means pricing is unknown for that model, NOT that the cost is zero. Treat null as "unknown" in all aggregations (poisons the total to null per run).

**Demo mode:** `result.usage` is `undefined` when `generateAgentOutput` returns early (no credentials). Only persist when `result.usage` is truthy.

**DB schema:** `lib/db/src/schema/llm-usage.ts` added, exported from `lib/db/src/schema/index.ts`. Table pushed via `pnpm --filter @workspace/db push`. After any schema change to `lib/db`, run `pnpm exec tsc -p tsconfig.json` in `lib/db` to regenerate declaration files before typechecking dependents.

## OpenAI versions (as of 2026-08-10)
- Python `openai`: 2.45.0 installed; pyproject.toml constraint `>=2.36.0` in both api-python and agent-worker.
- Node.js `openai`: ^6.37.0 (already at latest major).

## Model tier defaults (from llm-models.ts)
- frontier: gpt-4.1, o4-mini
- balanced: gpt-4.1-mini (default / FALLBACK_DEFAULT_MODEL)
- fast: gpt-4.1-nano

Per-agent overrides set via `setAgentModelOverride(slug, modelId)` API or AgentOps settings UI. Resolution: agent DB override → system_settings global → LLM_MODEL env → FALLBACK_DEFAULT_MODEL.
