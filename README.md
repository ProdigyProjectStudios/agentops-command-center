# AgentOps Command Center

An enterprise operations platform that routes business requests through a coordinated crew of specialist AI agents, grounds every decision in policy, and lands at a human approval gate with a complete audit trail.

---

## Overview

**The problem.** Operations teams at holding companies and scale-ups manage a constant backlog of approval requests — vendor contracts, ad spend, legal reviews, facilities work, hiring approvals. The bottleneck is rarely the decision itself; it is assembling the evidence that lets the right person make that decision quickly and defensibly.

**Who it is for.** Portfolio operators, COOs, and enterprise engineering teams evaluating AI-assisted workflow automation.

**What it delivers.** A fully auditable pipeline where each request is triaged, reviewed by specialist agents (Ops, Legal, Finance, Communications, Memory), synthesised into a recommendation, and routed to a human operator — with every agent action, retrieved evidence, tool call, confidence score, and operator decision stored as a typed, replayable record.

The platform ships with a **deterministic demo mode** that runs without an API key, and upgrades seamlessly to live OpenAI calls when a key is present.

---

## Live Demo

**[agent-ops-command-center.replit.app](https://agent-ops-command-center.replit.app)**

The live instance runs in demo mode by default. Submit any request via **New Request** to walk the full pipeline.

---

## Key Features

- **8-node agent state machine** — a directed graph of specialist nodes: Ops Triage → Memory Lookup → Legal Review → Finance Review → Communications Draft → Risk Synthesis → Approval Gate → Finalize
- **Typed agent output envelopes** — every agent step produces a structured record: summary, findings, risks, recommended actions, confidence score, and raw details
- **Human-in-the-loop approval queue** — every run surfaces an approval card with the recommendation, key evidence, and an explicit approve / reject / conditional-approve flow
- **Policy-grounded memory** — keyword retrieval across a knowledge base of policy documents; retrieved chunks are surfaced as evidence on each run
- **Tool call ledger** — every external action an agent performs is captured as a typed row with input, output, status, and duration
- **Full activity audit log** — every state transition, agent decision, and operator action is recorded in chronological order
- **RAG assessment pipeline** — a separate Python service runs retrieval-augmented assessment with LLM verdict and confidence-gated routing
- **Twilio voice integration** — inbound calls bridge via WebSocket to the OpenAI Realtime API for voice-triggered workflow interactions
- **Configurable model picker** — operators can swap the default LLM (gpt-4.1-mini, gpt-4.1, o4-mini, gpt-4.1-nano) per-agent from the Settings UI without touching code
- **OpenAPI contract-first design** — a single `openapi.yaml` drives both the generated React Query client hooks and the server-side Zod validators via orval codegen

---

## Technical Architecture

### Frontend
React 19 SPA built with Vite 7 and Tailwind CSS 4. Routing via Wouter. Data fetching via TanStack Query 5 with generated hooks from orval. UI components via Radix UI primitives (shadcn). Animations via Framer Motion. TypeScript throughout. Compiled to a static build and served behind the Node API server.

### Backend — Node (Orchestration API)
Express 5 API server written in TypeScript. Owns the primary orchestration logic: runs the 8-node agent state graph, persists all workflow state, manages the approval queue, and proxies `/api-python` requests to the Python service. Drizzle ORM manages the `public` schema.

### Backend — Python (RAG + Voice)
FastAPI service running on a separate process. Handles retrieval-augmented assessment (`/api-python/assess`), initial request intake and triage (`/api-python/intake`, `/api-python/triage`), workflow state queries, and a WebSocket bridge between Twilio Media Streams and the OpenAI Realtime API for voice calls. Psycopg3 for database access.

### Database
PostgreSQL 16 with two schema owners:
- **`public`** — managed by Drizzle ORM (Node side). Tables: `operational_requests`, `workflow_runs`, `agent_steps`, `tool_calls`, `approval_requests`, `agents`, `knowledge_documents`, `memory_chunks`, `activity_logs`, `portfolio_companies`, `system_settings`, `users`
- **`agentops_py`** — managed by Alembic migrations (Python side). Assessment records, vector memory metadata

### AI / Automation
- OpenAI chat completions API via the `openai` Node and Python SDKs
- Default model: `gpt-4.1-mini` (configurable per-agent; falls back to deterministic demo fixtures when no key is set)
- OpenAI Realtime API (`gpt-4o-mini-realtime-preview`) for voice interactions
- LLM responses are validated against Zod schemas with a coercion layer that handles model output variance without hard-failing

### External Integrations
- **Twilio** — inbound/outbound SMS via the Twilio Python SDK; Voice via Twilio Media Streams WebSocket bridge to OpenAI Realtime

### Deployment
Deployed on Replit Autoscale. A single production startup script (`scripts/start-production.sh`) runs Alembic migrations, starts the Python FastAPI service in the background, then hands the foreground to the Node API server. Health checked at `/api/healthz`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19, Vite 7 |
| Styling | Tailwind CSS 4, Radix UI (shadcn) |
| State / data fetching | TanStack Query 5, Wouter |
| Animations | Framer Motion |
| Node backend | TypeScript, Express 5 |
| Python backend | Python 3.11, FastAPI, uvicorn |
| ORM | Drizzle ORM (Node), psycopg3 raw SQL (Python) |
| Migrations | Drizzle Kit (Node schema), Alembic (Python schema) |
| Database | PostgreSQL 16 |
| AI SDK | openai (Node + Python) |
| Schema validation | Zod (Node), Pydantic v2 (Python) |
| API contract | OpenAPI 3.1, orval codegen |
| Telephony | Twilio SDK, Twilio Media Streams |
| Package manager | pnpm workspaces |
| Deployment | Replit Autoscale |

---

## How It Works

1. **Submit a request** — an operator submits an operational request (vendor spend, contract review, headcount, etc.) with a title, description, and portfolio company.
2. **Triage** — the Ops Conductor classifies the request, estimates cost, assigns a risk level, and routes it to the downstream agents.
3. **Memory lookup** — the Memory Keeper retrieves relevant policy documents from the knowledge base and surfaces them as evidence.
4. **Specialist review** — Legal Counsel runs compliance checks and contract analysis; Finance Analyst checks budget, utilisation, and 12-month forecast.
5. **Communications draft** — the Communications agent drafts an internal memo and an external announcement with a distribution list.
6. **RAG assessment** — the Python service independently runs a retrieval-augmented assessment, produces a confidence score, and routes: high confidence goes to auto-synthesis; lower confidence escalates to the human gate.
7. **Risk synthesis** — the Ops Conductor aggregates all agent findings into a single recommended decision with blocking issues and next actions.
8. **Approval gate** — the request lands in the approval queue. The operator sees the recommendation, evidence, and all agent findings, then approves, rejects, or conditionally approves with notes.
9. **Finalize** — the decision is recorded, the audit log is closed, and the workflow moves to a terminal state.

Every step — agent outputs, tool calls, state transitions, operator actions — is persisted and accessible from the workflow detail view.

---

## Screenshots

*Add screenshots to `docs/screenshots/` and update the paths below.*

| | |
|---|---|
| `docs/screenshots/dashboard.png` | Live dashboard with KPIs and agent crew |
| `docs/screenshots/workflow-detail.png` | Step-by-step pipeline view with agent outputs |
| `docs/screenshots/approval-queue.png` | Human approval queue with AI recommendations |
| `docs/screenshots/rag-assessment.png` | RAG assessment panel with confidence and evidence |
| `docs/screenshots/settings-models.png` | Per-agent model configuration UI |

---

## Local Development

**Prerequisites:** Node.js 20+, pnpm 9+, Python 3.11+, [uv](https://docs.astral.sh/uv/), PostgreSQL 16

```bash
# Clone and install Node dependencies
git clone https://github.com/your-username/agentops-command-center.git
cd agentops-command-center
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — DATABASE_URL is required; OPENAI_API_KEY is optional (demo mode works without it)

# Apply database migrations (Node schema)
pnpm --filter @workspace/db run migrate

# Apply Python schema migrations
cd artifacts/agent-worker
uv run alembic upgrade head
cd ../..

# Start all services (three separate terminals)
pnpm --filter @workspace/api-server run dev   # Node API on :8080
pnpm --filter @workspace/agentops run dev     # React frontend on :20962
cd api-python && uv run python main.py        # Python API on :8008
```

Open `http://localhost:20962` for the frontend. The app runs fully in demo mode without an OpenAI key.

---

## Environment Variables

Copy `.env.example` and fill in values. Only `DATABASE_URL` is required to run locally in demo mode.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | No | Enables live LLM calls; app runs in demo mode without it |
| `LLM_MODEL` | No | Override default model (default: `gpt-4.1-mini`) |
| `TWILIO_ACCOUNT_SID` | No | Required for SMS and voice features |
| `TWILIO_API_KEY` | No | Twilio API key SID |
| `TWILIO_API_KEY_SECRET` | No | Twilio API key secret |
| `TWILIO_PHONE_NUMBER` | No | Twilio sender number |
| `SESSION_SECRET` | No | Session signing secret (Express) |
| `PORT` | No | Node API port (default: `8080`) |
| `NODE_ENV` | No | `development` or `production` |

---

## Project Structure

```
├── artifacts/
│   ├── agentops/               # React + Vite frontend
│   │   └── src/
│   │       ├── components/     # UI components (PipelineFlow, RagAssessmentPanel, etc.)
│   │       └── pages/          # Route pages (dashboard, workflow-detail, approvals, etc.)
│   ├── api-server/             # Node.js orchestration API (Express 5 + Drizzle)
│   │   └── src/
│   │       ├── orchestration/  # 8-node agent state graph + node definitions
│   │       ├── lib/            # LLM client, model config, agents, audit
│   │       └── routes/         # API route handlers
│   └── agent-worker/           # Python background worker + Alembic migrations
├── api-python/                 # FastAPI RAG assessment and voice service
│   ├── main.py                 # FastAPI app + all route handlers
│   ├── voice.py                # Twilio ↔ OpenAI Realtime WebSocket bridge
│   └── twilio_client.py        # SMS helper
├── lib/
│   ├── db/                     # Drizzle schema + client (shared)
│   ├── api-spec/               # OpenAPI contract (source of truth)
│   ├── api-client-react/       # Generated TanStack Query hooks
│   └── api-zod/                # Generated Zod validators
├── scripts/
│   └── start-production.sh     # Production startup (migrations → Python → Node)
├── .env.example
└── pnpm-workspace.yaml
```

---

## Technical Highlights

**Contract-first API with codegen.** A single `openapi.yaml` is the source of truth. orval generates typed React Query hooks (client) and Zod validators (server) from it. Schema drift between frontend and backend is impossible — both sides are compiled from the same file.

**Two isolated schema owners on one database.** The Node service owns `public` via Drizzle ORM; the Python service owns `agentops_py` via Alembic. Each can migrate independently without interfering with the other. Migrations run automatically at production startup before either service begins accepting traffic.

**Demo mode / live mode duality.** Every agent node carries a typed demo fixture. If `OPENAI_API_KEY` is absent or the LLM call fails schema validation, the node falls back to the fixture and marks the output `fallback: "demo"`. The UI surfaces this transparently. The entire pipeline is always runnable.

**LLM schema coercion layer.** Different model versions return structurally different JSON for the same prompt. Rather than letting Zod hard-fail and fall back to demo, agent schemas use `z.preprocess` to coerce known variance patterns (e.g. `flaggedClauses` returned as objects instead of strings) into the expected shape. Falls back to demo only when the coercion itself fails.

**Confidence-gated routing in the RAG pipeline.** The Python assessment service computes a confidence score from retrieved policy chunks. Scores above the configured threshold are passed directly to synthesis; scores below escalate to the human approval gate. The routing decision is visible in the RAG Assessment panel.

**Twilio Voice → OpenAI Realtime bridge.** Inbound Twilio calls are received as Media Streams (WebSocket, G.711 µ-law audio). The Python service proxies audio frames bidirectionally to the OpenAI Realtime API and streams responses back to the caller in real time.

**Typed agent output envelopes enforced at the boundary.** `BaseAgent` validates every LLM response against `agentOutputSchema` before the result is persisted. No untyped or partially-shaped data reaches the database regardless of which agent produced it.

---

## Author

**Aaron Archer**  
AI-Native Full-Stack & Systems Engineer  
[digitalprodigy.dev](https://digitalprodigy.dev)

---

## Licence

This repository is published as a portfolio sample. You are welcome to read, reference, and learn from the code. Please do not redistribute it as your own work or use it as the basis of a commercial product without permission.
