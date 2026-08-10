# AgentOps Command Center

AgentOps is a controlled multi-agent operations architecture demonstrating how non-deterministic LLM workflows can be orchestrated, evaluated, grounded, observed, and governed.

Operational requests move through a typed 8-node agent state machine — triaged by an Ops Conductor, reviewed by specialist agents (legal, finance, communications), grounded in policy memory via pgvector semantic retrieval, synthesised into a recommendation, and routed to a formal human approval gate. Every agent action, tool call, and decision is stored as a typed, replayable audit record.

> **Portfolio system.** API routes are not protected by authentication middleware. This demonstrates multi-agent orchestration architecture. A production deployment would require adding auth before exposing it to real users.

---

## What it demonstrates

1. **Typed multi-agent orchestration** — a directed 8-node state graph of specialist agents running in sequence, each producing a validated, structured output before passing control to the next
2. **Structured LLM output contracts** — every node produces a typed `AgentOutput` envelope (summary, findings, risks, confidence, details) enforced by Zod at the persistence boundary
3. **Human approval / auditability** — a formal approval gate with AI recommendation, aggregated evidence, and an explicit operator decision; every state transition is audited
4. **Deterministic golden-scenario evaluation** — four named behavioral regression scenarios, 152 checks across six specialist agents and cross-agent consistency, machine-readable JSON reports
5. **Real BaseAgent boundary validation** — exported `NodeDefinition.run()` → `BaseAgent.run()` → `getModelForAgent()` → `buildEnvelope()` → `agentOutputSchema.parse()` tested against seeded PostgreSQL in forced demo mode
6. **PostgreSQL + pgvector retrieval** — `memory_chunks.embedding vector(1536)` with cosine similarity search via `<=>` operator; keyword fallback when no vector hits
7. **Retrieval fallback behavior** — vector → keyword → empty, with graceful degradation at each stage; `retrieval_mode` reported in every assessment response
8. **Per-agent model selection and tiers** — three tiers (frontier / balanced / fast), four-level precedence resolution, operator-configurable from the Settings UI without code changes
9. **Provider usage / token telemetry** — input tokens, output tokens, total tokens, and duration captured from every live provider round-trip; stored in `llm_usage` table
10. **Estimated LLM cost aggregation** — per-call and per-run cost estimates in microdollars; unknown-model pricing represented as null, not zero
11. **Failure / fallback handling** — fallback to deterministic demo fixtures on missing credentials, empty content, JSON parse failure, or schema validation failure; fallback reason surfaced in UI
12. **Contract-first API / service architecture** — a single `openapi.yaml` generates typed TanStack Query hooks and Zod validators; schema drift between frontend and backend is structurally impossible

---

## Live Demo

**[agentops.digitalprodigy.dev](https://agentops.digitalprodigy.dev)**

Runs in deterministic demo mode by default — no API key required. Set `OPENAI_API_KEY` to switch to live LLM calls. Submit any request via **New Request** to run the full pipeline.

---

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)
*Command Center dashboard — live KPI strip, orchestrator telemetry, and agent crew status.*

![Workflow Detail](docs/screenshots/workflow-detail.png)
*Completed workflow — run timeline with per-agent durations, final executive brief, key evidence, and next actions.*

![Agent Outputs and Audit Trail](docs/screenshots/agent-audit-trail.png)
*Forensic depth view — 8-node agent graph, per-agent structured outputs with confidence scores, run snapshot, and chronological audit log.*

![Approval and RAG Assessment](docs/screenshots/approval-and-rag.png)
*Approval panel — RAG assessment result, confidence-gated routing decision, and the operator's final approval record.*

---

## Technical Architecture

### Frontend
React 19 SPA — Vite 7, Tailwind CSS 4, Radix UI (shadcn), TanStack Query 5, Wouter, Framer Motion. Compiled to static files served by the Node API server. All data access goes through generated TanStack Query hooks derived from the OpenAPI contract.

### Backend — Node (Orchestration API)
Express 5, TypeScript. Runs the 8-node agent state graph, persists all workflow state via Drizzle ORM, manages the approval queue, and reverse-proxies `/api-python/*` to the Python service. Routes are open — no auth middleware.

### Backend — Python (Assessment + Voice)
FastAPI, Python 3.11, uvicorn. Handles retrieval-augmented assessment (including pgvector embedding and cosine similarity search), request intake and triage, and a bidirectional WebSocket bridge between Twilio Media Streams and the OpenAI Realtime API.

### Database
PostgreSQL 16, two schema owners:
- **`public`** — Drizzle ORM (Node). 13 tables covering requests, runs, agent steps, tool calls, approvals, memory chunks (with `vector(1536)` embeddings), knowledge documents, audit log, agents, settings, and LLM usage telemetry.
- **`agentops_py`** — Alembic (Python). Assessment records, memory metadata, job queue, and voice call events.

### AI / Automation
OpenAI `openai` SDK (Node + Python). Default: `gpt-4.1-mini`. Available tiers: frontier (`gpt-4.1`, `o4-mini`), balanced (`gpt-4.1-mini`), fast (`gpt-4.1-nano`). Embeddings: `text-embedding-3-small`. Voice: `gpt-4o-mini-realtime-preview`. Falls back to typed demo fixtures with no key present.

### External Integrations
Twilio SDK — inbound/outbound SMS; Twilio Media Streams WebSocket for voice.

### Deployment
Replit Autoscale. `scripts/start-production.sh`: Alembic migrations → Python FastAPI (background) → Node API (foreground). Health: `GET /api/healthz`.

For full architecture diagrams and sequence flows, see [docs/architecture.md](docs/architecture.md).

---

## How It Works

1. **Submit** — operator submits a request (vendor spend, contract review, headcount, etc.) with title, description, and portfolio company.
2. **Triage** — Ops Conductor classifies the request, estimates cost impact, assigns a risk level, and fingerprints it for downstream agents.
3. **Memory** — Memory Keeper embeds the query and performs cosine similarity search against `memory_chunks.embedding` (pgvector); retrieved policy chunks are stored as evidence. Falls back to keyword search if vector retrieval produces no hits.
4. **Legal** — Legal Counsel runs compliance checks, flags contract clauses, and produces a risk assessment with confidence score.
5. **Finance** — Finance Analyst checks budget utilisation, runs a 12-month forecast, and flags spend threshold violations.
6. **Communications** — Communications Lead drafts an internal memo and external announcement with a distribution list.
7. **RAG assessment** — Python service independently embeds the request, retrieves policy context via pgvector, calls the LLM for a structured verdict, and confidence-gates routing.
8. **Synthesis** — Ops Conductor aggregates all agent findings into a single recommended decision with blocking issues and next actions.
9. **Approval gate** — workflow lands in the operator queue. Operator reviews recommendation, evidence, risks, and tool calls; approves, rejects, or conditionally approves.
10. **Finalize** — decision recorded, audit log closed, workflow moves to terminal state.

---

## Evaluation & Regression Testing

```bash
# Run the deterministic eval harness (writes JSON report + prints summary)
pnpm --filter @workspace/api-server run eval

# Run the full test suite (eval checks run but no report is written)
pnpm --filter @workspace/api-server test
```

### Layer 1 — Deterministic golden scenarios

Four named scenarios exercise the decision boundary of the complete specialist demo path without a database, server, or API key:

| Scenario | Risk level | Decision |
|---|---|---|
| `saas-tool-low-risk` | low | approve |
| `acquisition-high-risk` | high | conditional_approve |
| `layoff-critical-risk` | critical | reject |
| `marketing-medium-risk` | medium | approve |

Per scenario, 38 behavioral checks cover: fingerprint→risk mapping, specialist Zod schema validity, `AgentOutput` envelope validity, explicit golden values (risk level, recommended decision, budget outcome), output quality invariants (non-empty strings, minimum length), confidence floors, and cross-agent consistency (triage / legal / synthesis risk level agreement, decision consistency with risk level). 4 scenarios × 38 checks = **152 behavioral regression checks**.

The eval command writes a machine-readable JSON report to `eval-results/` and prints a human-readable summary. Ordinary `pnpm test` runs include the same regression assertions without writing the report.

**What these evals prove:** deterministic demo decision logic produces correct outputs for known input classes. **What they do not prove:** live LLM output quality, production semantic retrieval accuracy, or post-deployment behavioral stability.

Coverage gaps are explicitly listed in the JSON report under `coverageGaps`.

### Layer 2 — Runtime boundary validation (`node-boundary.test.ts`)

Four tests exercise the real production agent execution boundary against a seeded PostgreSQL instance, in forced demo mode (no live LLM calls):

```
NodeDefinition.run(ctx)
  → BaseAgent.run(state)
    → getModelForAgent(slug)       [queries PostgreSQL]
    → generateAgentOutput()        [demo dispatch — no credentials]
    → demoDetails(state)           [real *Demo() fixture]
    → buildEnvelope(details, state) [per-agent envelope builder]
    → agentOutputSchema.parse()    [enforcement parse]
  → NodeResult.output              [real AgentOutput]
```

These tests cover what the golden eval cannot: real `buildEnvelope()` output, real `agentOutputSchema` enforcement at the persistence boundary, and real model resolution via `getModelForAgent()`.

---

## LLM Usage & Cost Telemetry

Every live agent call — including calls whose response is later rejected (invalid JSON, schema validation failure, shape mismatch) — records token usage and estimated cost in the `llm_usage` table.

| Field | Description |
|---|---|
| `provider` | Always `"openai"` |
| `model` | Resolved model string actually passed to the API |
| `input_tokens` | `completion.usage.prompt_tokens` (null if provider omits usage) |
| `output_tokens` | `completion.usage.completion_tokens` (null if provider omits usage) |
| `total_tokens` | `completion.usage.total_tokens` (null if provider omits usage) |
| `estimated_cost_micros` | Estimated cost in integer microdollars (USD × 1,000,000); null for unpriced models |
| `duration_ms` | Wall-clock provider round-trip in milliseconds |
| `fallback_reason` | Set when the agent fell back to its demo payload; null on success |

**Key semantics:**

- Token counts are captured for all post-response fallback modes (`invalid_json`, `schema_validation`, `shape_mismatch`, `empty_content`). Tokens were consumed by the provider even though the response was rejected.
- For hard failures (`api_error`, timeouts), duration is captured but token counts are null — the provider may not have billed.
- Demo mode (no credentials) generates no `llm_usage` rows. No fake paid-token data is recorded.
- `estimated_cost_micros: null` means the model's pricing is not configured — not that the cost was zero. Treat null as unknown.
- **Telemetry persistence is deliberately best-effort and non-blocking** so a monitoring failure cannot break agent execution. DB write failures are logged at WARN and never re-thrown to the caller.
- This is operational telemetry for cost monitoring and trend analysis. It is **not a guaranteed billing ledger**.

Aggregation helper: `getRunTelemetry(workflowRunId)` in `artifacts/api-server/src/lib/telemetry.ts` returns per-agent breakdown and run totals.

---

## Model Configuration

Resolution order (highest priority wins):

| Priority | Source | Notes |
|---|---|---|
| 1 | `agents.model_override` | Per-agent DB column |
| 2 | `system_settings` key `"default_model"` | Global DB setting |
| 3 | `LLM_MODEL` environment variable | Process-level override |
| 4 | `gpt-4.1-mini` | Hard-coded fallback |

Available model tiers:

| Tier | Models |
|---|---|
| frontier | `gpt-4.1`, `o4-mini` |
| balanced | `gpt-4.1-mini` (current default) |
| fast | `gpt-4.1-nano` |

Operators can assign a stronger or cheaper model to any individual agent from the Settings UI (System → Models) without modifying orchestration code. The change takes effect within one cache TTL (30 seconds). The current fallback default is `gpt-4.1-mini`.

This model-routing architecture pre-existed and was verified with tests during the Task 3 sprint. Task 3 added token/cost telemetry; it did not introduce the routing system.

---

## Local Development

**Prerequisites:** Node.js 22+, pnpm 10+, Python 3.11+, [uv](https://docs.astral.sh/uv/), PostgreSQL 16

```bash
# Clone
git clone https://github.com/ProdigyProjectStudios/agentops-command-center.git
cd agentops-command-center

# Node dependencies
pnpm install

# Environment
cp .env.example .env
# Edit .env — DATABASE_URL required; OPENAI_API_KEY optional (demo mode works without it)

# Node schema migrations (public schema)
pnpm --filter @workspace/db run push

# Python schema migrations (agentops_py schema)
cd artifacts/agent-worker && uv run alembic upgrade head && cd ../..

# Start services (three terminals)
pnpm --filter @workspace/api-server run dev       # :8080
pnpm --filter @workspace/agentops run dev         # :20962
cd api-python && uv run python main.py            # :8008
```

Open `http://localhost:20962`. Demo mode works without an OpenAI key.

**Embedding backfill** (required for live vector retrieval against the policy knowledge base):

```bash
cd artifacts/agent-worker
uv run python backfill_embeddings.py           # embed all NULL rows
uv run python backfill_embeddings.py --dry-run # preview without writing
uv run python backfill_embeddings.py --batch-size 20
```

**Run evaluation harness:**

```bash
pnpm --filter @workspace/api-server run eval
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | No | Live LLM calls; demo mode used without it |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | No | Replit-managed OpenAI integration key (alternative to `OPENAI_API_KEY`) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | Replit-managed OpenAI base URL; set alongside `AI_INTEGRATIONS_OPENAI_API_KEY` |
| `LLM_MODEL` | No | Process-level model override (lowest priority; see model config section) |
| `TWILIO_ACCOUNT_SID` | No | SMS and voice features |
| `TWILIO_API_KEY` | No | Twilio API key SID |
| `TWILIO_API_KEY_SECRET` | No | Twilio API key secret |
| `TWILIO_PHONE_NUMBER` | No | Twilio sender number |
| `SESSION_SECRET` | No | Express session signing secret |
| `PORT` | No | Node API port (default: `8080`) |
| `NODE_ENV` | No | `development` or `production` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Radix UI |
| State / data fetching | TanStack Query 5, Wouter |
| Animations | Framer Motion |
| Node backend | TypeScript, Express 5 |
| Python backend | Python 3.11, FastAPI, uvicorn |
| ORM | Drizzle ORM (Node), psycopg3 (Python) |
| Migrations | Drizzle Kit (Node), Alembic (Python) |
| Database | PostgreSQL 16 + pgvector |
| AI SDK | openai (Node + Python) |
| Schema validation | Zod (Node), Pydantic v2 (Python) |
| API contract | OpenAPI 3.1, orval codegen |
| Telephony | Twilio SDK, Twilio Media Streams |
| Package manager | pnpm workspaces |
| Deployment | Replit Autoscale |

---

## Project Structure

```
├── artifacts/
│   ├── agentops/               # React + Vite frontend
│   │   └── src/
│   │       ├── components/     # PipelineFlow, RagAssessmentPanel, TelemetryStrip, …
│   │       └── pages/          # dashboard, workflow-detail, approvals, agents, settings, …
│   ├── api-server/             # Node.js orchestration API
│   │   └── src/
│   │       ├── orchestration/  # 8-node graph, node definitions, schemas, demo-outputs, eval
│   │       ├── lib/            # BaseAgent, LLM client, model config, telemetry, pricing, audit
│   │       ├── routes/         # Express route handlers
│   │       └── __tests__/      # unit tests, eval harness, node boundary tests, telemetry tests
│   └── agent-worker/           # Python background worker — embeddings, vector search, Alembic
│       ├── app.py              # FastAPI app + worker loop + embedding + memory search
│       ├── memory_store.py     # pgvector embedding storage and cosine similarity retrieval
│       ├── backfill_embeddings.py  # CLI: embed all NULL memory_chunks rows
│       └── alembic/            # agentops_py schema migrations
├── api-python/                 # FastAPI RAG assessment and voice service
│   ├── main.py                 # All FastAPI route handlers (assess, intake, triage, …)
│   ├── voice.py                # Twilio ↔ OpenAI Realtime WebSocket bridge
│   └── twilio_client.py        # SMS helper
├── lib/
│   ├── db/                     # Drizzle schema + client (shared)
│   │   └── src/schema/         # 13 tables including llm_usage, memory_chunks (vector)
│   ├── api-spec/               # OpenAPI contract (source of truth)
│   ├── api-client-react/       # Generated TanStack Query hooks
│   └── api-zod/                # Generated Zod validators
├── docs/
│   ├── architecture.md         # Detailed architecture + Mermaid diagrams
│   └── screenshots/            # dashboard, workflow-detail, agent-audit-trail, approval-and-rag
├── scripts/
│   └── start-production.sh     # Production startup script
├── .github/workflows/ci.yml    # CI: typecheck, build, test, Python syntax
├── .env.example
└── pnpm-workspace.yaml
```

---

## Technical Highlights

**Contract-first API with codegen.** A single `openapi.yaml` is the authoritative source. orval generates typed TanStack Query hooks for the frontend and Zod validators for the server from it. Schema drift between the two layers is structurally impossible.

**Two isolated schema owners on one database.** The Node service owns `public` via Drizzle ORM; the Python service owns `agentops_py` via Alembic. Each migrates independently. Both schemas are created and migrated atomically at production startup before either process accepts traffic.

**Typed output envelopes enforced at the persistence boundary.** `BaseAgent` validates every LLM response against `agentOutputSchema` (Zod) before writing to `agent_steps`. No partially-shaped or unvalidated data reaches the database — regardless of which node produced the output or which model was called.

**Demo mode / live mode duality with transparent fallback.** Every agent node carries a deterministic typed demo fixture. If credentials are absent, the LLM call fails, or schema validation fails after coercion, the node falls back to the fixture and marks the output with a typed `FallbackInfo` object (mode, reason, message). The UI surfaces the fallback badge. The full pipeline is always runnable.

**pgvector semantic retrieval with keyword fallback.** The Python assessment service (and the Memory Keeper agent worker) embed each query using `text-embedding-3-small`, then perform cosine similarity search against `memory_chunks.embedding vector(1536)` using the `<=>` operator. If no vector hits are found, or if the vector extension is unavailable, retrieval falls back to keyword matching. Every assessment response reports `retrieval_mode` and `retrieval_chunks_used`.

**Per-agent model configuration with runtime hot-swap.** Model selection resolves at call time through a four-level priority chain (per-agent DB override → global DB setting → env var → hard-coded fallback) with a 30-second in-process cache. Operators change models from the Settings UI; the next agent invocation picks up the change without a restart.

**Real provider token/cost telemetry.** Every live LLM call persists token counts and estimated cost to the `llm_usage` table. Post-response fallbacks (invalid JSON, schema validation failure) still record the actual consumed tokens. Estimated cost is expressed in microdollars against a centralized pricing table; unpriced models produce null rather than a fabricated zero.

**Confidence-gated routing in the RAG pipeline.** The Python assessment service retrieves policy chunks, assembles a prompt, calls the LLM for a structured verdict, and scores confidence from the response. Above threshold → auto-route to synthesis. Below threshold → escalate to human approval gate.

**Twilio Voice → OpenAI Realtime bidirectional bridge.** Inbound Twilio calls arrive as G.711 µ-law Media Streams over WebSocket. The Python service proxies audio frames to the OpenAI Realtime API and returns synthesised speech back to Twilio in real time.

**Node + Python service coordination without a message broker.** The two services share state through PostgreSQL. No Redis, no Kafka, no sidecar — a single database with clear schema ownership boundaries.

---

## Author

**Aaron Archer**  
AI-Native Full-Stack & Systems Engineer  
[digitalprodigy.dev](https://digitalprodigy.dev)

---

## Licence

Proprietary source code. Publicly available for portfolio evaluation and technical review only. Copying, redistribution, commercial use, and derivative works are prohibited without written permission. See [LICENSE](LICENSE).
