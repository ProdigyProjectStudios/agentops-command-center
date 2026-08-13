# AgentOps Command Center — Engineering Reference

Technical handoff documentation for engineers and agents entering this repository.

---

## Services

| Service | Directory | Port | Start command |
|---|---|---|---|
| Node orchestration API | `artifacts/api-server/` | 8080 | `pnpm --filter @workspace/api-server run dev` |
| React SPA | `artifacts/agentops/` | 20962 (dev) | `pnpm --filter @workspace/agentops run dev` |
| Python assessment + voice | `api-python/` | 8008 | `cd api-python && uv run python main.py` |
| Python worker (embed + search) | `artifacts/agent-worker/` | 8000 | `uv run --project artifacts/agent-worker python artifacts/agent-worker/app.py` |

Production startup: `sh scripts/start-production.sh` (Alembic migrations → Python background → Node foreground).

---

## Routing

```
External HTTPS (Replit proxy)
  ├── /api/*          → api-server:8080
  └── /api-python/*   → api-server:8080 → [HTTP proxy] → api-python:8008

api-python:8008 → agent-worker:8000  (HTTP, localhost — retrieval calls)
All services → PostgreSQL (via DATABASE_URL)
```

The proxy is a hand-rolled `http.request()` pipe in `artifacts/api-server/src/app.ts`. WebSocket upgrades tunnel via `server.on('upgrade', ...)` in `artifacts/api-server/src/index.ts`.

---

## Database / Schema Ownership

Two schemas on one PostgreSQL 16 instance:

**`public`** — owned by Node / Drizzle ORM  
Migrate: `pnpm --filter @workspace/db run push`  
Build declarations after schema changes: `cd lib/db && pnpm exec tsc -p tsconfig.json`

| Table | Notes |
|---|---|
| `operational_requests` | Source request |
| `workflow_runs` | Execution instance |
| `agent_steps` | Agent output JSONB per node |
| `tool_calls` | Tool call ledger |
| `approval_requests` | Human approval records |
| `agents` | Agent registry + `model_override` |
| `knowledge_documents` | Policy document store |
| `memory_chunks` | Chunked text + `embedding vector(1536)` |
| `activity_logs` | Audit trail |
| `portfolio_companies` | Company registry |
| `system_settings` | Key/value settings (e.g. `default_model`) |
| `llm_usage` | Token/cost telemetry per provider call |
| `users` | User table (no auth enforced yet) |

**`agentops_py`** — owned by Python / Alembic  
Migrate: `cd artifacts/agent-worker && uv run alembic upgrade head`  
Current head: `e1a2b3c4d5f6`

When adding a new Alembic migration: set `down_revision` to the current head (`e1a2b3c4d5f6`) before running `alembic revision`.

---

## Orchestration Boundaries

**Node (TypeScript)** owns:
- 8-node agent state graph (`artifacts/api-server/src/orchestration/`)
- All workflow state persistence (Drizzle)
- Human approval queue
- Model configuration and resolution
- LLM call dispatch (`generateAgentOutput` in `lib/llm.ts`)
- Token/cost telemetry (`lib/telemetry.ts`, `lib/llm-pricing.ts`)

**Python FastAPI (`api-python`)** owns:
- RAG assessment endpoint (`/api-python/assess`)
- Request intake and triage
- Twilio ↔ OpenAI Realtime WebSocket voice bridge
- pgvector retrieval calls (delegated to agent-worker)

**Python worker (`artifacts/agent-worker`)** owns:
- Vector embedding storage (`memory_store.py`)
- Cosine similarity search over `memory_chunks.embedding`
- Keyword fallback retrieval
- Alembic migration chain for `agentops_py`
- Durable job loop for async work

---

## Eval Commands

```bash
# Run golden eval (writes JSON report + prints summary)
pnpm --filter @workspace/api-server run eval

# Full Node test suite (includes eval assertions, no report written)
pnpm --filter @workspace/api-server test

# TypeScript typecheck
pnpm --filter @workspace/api-server run typecheck

# Python retrieval tests
cd api-python && uv run pytest tests/test_retrieval.py tests/test_pipeline.py -v
```

After any schema change to `lib/db`, rebuild declarations before running tests:
```bash
cd lib/db && pnpm exec tsc -p tsconfig.json
```

---

## Retrieval Architecture

**Live path:**
```
query string
  → embed (text-embedding-3-small via OpenAI)
  → pgvector cosine search: memory_chunks.embedding <=> query_vec
  → if no hits: keyword fallback (ILIKE token matching)
  → return {hits, retrieval_mode, retrieval_chunks_used}
```

**Test path:** deterministic fixed-dimension embeddings (no API call required).

Embedding ingestion is **explicit / CLI-driven**:
```bash
cd artifacts/agent-worker
uv run python backfill_embeddings.py [--dry-run] [--batch-size N]
```

The `/worker/memory/search-spike` route path is stable and hardcoded in `api-python/main.py:671`. Do not rename it.

No HNSW or IVFFlat index configured. Retrieval uses exact cosine distance.

---

## pgvector Migration / Backfill

pgvector is enabled via Alembic migration `c7f3a2b1d4e5` (`CREATE EXTENSION IF NOT EXISTS vector`). The `memory_chunks.embedding vector(1536)` column was added in a subsequent migration.

After adding new knowledge documents:
1. Run backfill CLI (see above)
2. Verify: `SELECT COUNT(*) FROM memory_chunks WHERE embedding IS NULL` should return 0

---

## Model Configuration Precedence

Resolution in `artifacts/api-server/src/lib/model-config.ts`:

```
1. agents.model_override (per-agent DB column)
2. system_settings key "default_model" (global DB)
3. LLM_MODEL environment variable
4. FALLBACK_DEFAULT_MODEL = "gpt-4.1-mini" (hardcoded)
```

Cache TTL: 30 seconds in-process. Invalidated immediately on any write via `invalidateModelCache()`.

Available tiers:

| Tier | Models |
|---|---|
| frontier | `gpt-4.1`, `o4-mini` |
| balanced | `gpt-4.1-mini` (default) |
| fast | `gpt-4.1-nano` |

Operators change the default or per-agent overrides in Settings → System → Models. No restart needed.

After adding a new Drizzle schema file, always run `cd lib/db && pnpm exec tsc -p tsconfig.json` before running `pnpm typecheck` in dependent packages.

---

## LLM Telemetry

Table: `public.llm_usage` (Drizzle schema: `lib/db/src/schema/llm-usage.ts`)

One row per live provider round-trip. Fields: `workflow_run_id`, `agent_slug`, `provider`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost_micros` (integer microdollars, null = unpriced model), `duration_ms`, `fallback_reason`, `created_at`.

Pricing catalog: `artifacts/api-server/src/lib/llm-pricing.ts`. Add new models here when they are added to `AVAILABLE_MODELS` in `llm-models.ts`.

Persistence helper: `persistTelemetry(record)` in `artifacts/api-server/src/lib/telemetry.ts`.
Aggregation helper: `getRunTelemetry(workflowRunId)` — returns per-agent breakdown and run totals.

Telemetry is **fire-and-forget** from `BaseAgent.run()`. Failures are logged at WARN and never thrown to callers. This is best-effort operational monitoring, not a billing ledger.

Token counts are captured for all post-response fallback modes (`invalid_json`, `schema_validation`, `shape_mismatch`, `empty_content`). Hard failures (`api_error`) capture duration only.

Demo mode (no credentials) writes no `llm_usage` rows.

---

## Tests

| Suite | Command | Notes |
|---|---|---|
| Node unit + eval | `pnpm --filter @workspace/api-server test` | 94 tests (as of last sprint) |
| Node eval with report | `pnpm --filter @workspace/api-server run eval` | Writes `eval-results/*.json` |
| TypeScript typecheck | `pnpm --filter @workspace/api-server run typecheck` | Must pass clean |
| Python retrieval | `cd api-python && uv run pytest tests/test_retrieval.py -v` | 10 tests |
| Python pipeline | `cd api-python && uv run pytest tests/test_pipeline.py -v` | 8 tests |

Known: `test_job_retries_with_backoff_hits_max_ceiling` in `test_pipeline.py` has a pre-existing intermittent race (live worker claims test job between iterations). Unrelated to any current sprint work.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | No | Live LLM calls + embeddings |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | No | Replit-managed OpenAI key (alternative to `OPENAI_API_KEY`) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | Replit-managed base URL (paired with above) |
| `LLM_MODEL` | No | Process-level model override (lowest priority) |
| `WORKER_BASE_URL` | No | Agent worker URL (default: `http://127.0.0.1:8000`) |
| `WORKER_INGEST_SECRET` | No* | Shared secret for `POST /worker/memory/ingest`; endpoint returns 503 without it |
| `LLM_REQUEST_TIMEOUT_MS` | No | LLM call timeout in ms (default: `20000`) |
| `TWILIO_ACCOUNT_SID` | No | SMS and voice |
| `TWILIO_API_KEY` | No | Twilio API key SID |
| `TWILIO_API_KEY_SECRET` | No | Twilio API key secret |
| `TWILIO_PHONE_NUMBER` | No | Twilio sender number |
| `SESSION_SECRET` | No | Express session signing secret |
| `PORT` | No | Node API port (default: `8080`) |
| `NODE_ENV` | No | `development` or `production` |

---

## Known Limitations

1. **No auth middleware.** All API routes are open. The `users` table exists but is not used.
2. **No auto-embedding ingestion.** New policy documents require a manual `backfill_embeddings.py` run.
3. **No HNSW/ANN index on `memory_chunks.embedding`.** Exact cosine distance. Acceptable at current document counts; index should be added before large-scale ingestion.
4. **No idempotency key on `llm_usage`.** Duplicate rows are possible on retried agent runs.
5. **Telemetry not surfaced in UI.** `llm_usage` rows are stored and queryable but there is no API route or dashboard view for per-run token/cost breakdown yet.
6. **`estimatedCostCents` on `workflow_runs` is always 0.** This pre-existing placeholder is separate from the `llm_usage` table and is not currently populated.
7. **Known intermittent race in `test_job_retries_with_backoff_hits_max_ceiling`.** Live worker claims test job between iterations. Does not affect production behavior.

---

## User Preferences

- Keep eval documentation precise: distinguish what deterministic checks prove vs. what they do not prove.
- `estimated cost` always qualifies cost figures as estimates unless describing raw provider billing data.
- The model-routing architecture pre-existed the Task 3 telemetry sprint. Do not claim Task 3 introduced it.
- `llm_usage.estimated_cost_micros: null` means unknown pricing, not zero cost.
- The `/worker/memory/search-spike` route path is stable — do not rename it.
