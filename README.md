# AgentOps Command Center

Portfolio-grade multi-agent enterprise operations platform — a working demo of how a small crew
of specialized AI agents can triage incoming operational requests, run them through legal,
finance, and communications review, ground their reasoning in a knowledge base, and land at a
human approval gate with a clear recommendation, risk level, and audit trail.

> **What this is:** a polished, fully wired reference implementation built on Replit.
> **What it isn't:** production firmware. There is no auth, no real vector store, and the agent
> tools are illustrative.

---

## Why this exists

Modern operations teams drown in approval queues — vendor contracts, ad spend, hiring asks,
facilities work, legal reviews. Every one of them needs a quick risk read, a budget check, a
draft comms note, and a paper trail. AgentOps wires those steps into a single deterministic
pipeline of agents you can audit step by step:

```
                ┌──────────────────────────────────────────────────┐
   request  ──► │  Ops Conductor  → triage & route                 │
                │  Memory         → ground in knowledge base       │
                │  Legal Counsel  → compliance & contract review   │
                │  Finance        → budget fit & forecast          │
                │  Comms          → internal + external draft      │
                │  Synthesis      → final recommendation           │
                └──────────────────┬───────────────────────────────┘
                                   ▼
                          Human Approval Gate
                                   ▼
                          finalized / rejected
```

Each step writes a typed `AgentStep` row, the tools it called, the activity it generated, and
its confidence. Nothing is hidden — the workflow detail page lets you expand every step's
input, output, and tool calls.

---

## Architecture

A single TypeScript monorepo (pnpm workspaces) with one source-of-truth API contract that
generates both the React Query hooks and the Zod validators.

```
                ┌───────────────────────────┐
                │  lib/api-spec/openapi.yaml │  ◄── single source of truth
                └─────────────┬─────────────┘
                              │  orval codegen
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
   lib/api-client-react   lib/api-zod      types reused
   (React Query hooks)   (Zod schemas)    on both sides
              ▲                                ▲
              │                                │
   artifacts/agentops               artifacts/api-server
   (React + Vite)                   (Express 5 + Drizzle)
                                              │
                                              ▼
                                  PostgreSQL (Drizzle ORM)
```

| Package                           | Role                                      |
| --------------------------------- | ----------------------------------------- |
| `lib/api-spec`                    | OpenAPI contract + orval config           |
| `lib/api-client-react`            | Generated React Query hooks               |
| `lib/api-zod`                     | Generated Zod schemas                     |
| `lib/db`                          | Drizzle schema, db client, migrations     |
| `artifacts/api-server`            | Express 5 server, agent orchestrator      |
| `artifacts/agentops`              | React + Vite Command Center UI            |

The orchestrator lives in `artifacts/api-server/src/orchestration/`. Each agent step is its
own `NodeDefinition` (`nodes/*.ts`); the engine walks the `PIPELINE` array, persists the
result, and advances `workflow_status` (`submitted → triaged → legal_review → finance_review →
communications_draft → approval_pending → approved/rejected → finalized`).

---

## Local setup

```bash
# 1. install
pnpm install

# 2. create the database schema (DATABASE_URL must be set)
pnpm --filter @workspace/db run push

# 3. seed agents, sample companies, and a couple of demo requests
pnpm --filter @workspace/api-server run seed

# 4. run everything (each in its own terminal, or use the provided workflows)
pnpm --filter @workspace/api-server run dev      # API server
pnpm --filter @workspace/agentops      run dev   # Frontend
```

On Replit the three workflows (`artifacts/agentops: web`, `artifacts/api-server: API Server`,
`artifacts/mockup-sandbox: Component Preview Server`) start automatically.

---

## Demo walkthrough

1. Open the **Dashboard** — five live KPIs, recent workflows, and an agent health grid.
2. Click **New Request** and submit something like
   *"Approve $48K roofing contractor for Acme HQ Q2"*. You'll be taken to the workflow detail.
3. Hit **Run Workflow**. The pipeline timeline lights up stage by stage as each agent step
   completes; the page polls every 1.2s while the run is in flight.
4. Expand any agent card to see its input, JSON output, reasoning summary, confidence, and the
   tool calls it issued.
5. When the run reaches **Human Approval**, approve or reject from the right-rail card. The
   workflow finalizes (or rejects) and the audit log captures the decision.
6. Visit **Approvals**, **Tool Calls**, **Knowledge**, **Agents**, and **Settings** to see the
   secondary surfaces. Settings shows whether you're in **Demo Mode** or **Live Mode** based
   on the API key configuration.

---

## Demo mode vs live mode

The platform always works without an API key. When no key is configured the orchestrator
returns the deterministic scenario outputs in `orchestration/demo-outputs.ts` — a roofing
contractor, marketing campaign, or hiring request will each produce realistic legal, finance,
and comms output. This makes it bulletproof for portfolio demos.

When an API key **is** present, the same `generateAgentOutput()` abstraction calls OpenAI's
chat completions API with the JSON response format and merges the LLM's response over the
demo defaults (so any field the model omits gracefully falls back). Any error in the LLM call
also falls back to demo output — the pipeline never breaks.

The mode badge in the top-right of the app reflects which path is active.

---

## Environment variables

| Variable                            | Required | Description                                                       |
| ----------------------------------- | :------: | ----------------------------------------------------------------- |
| `DATABASE_URL`                      | yes      | PostgreSQL connection string                                      |
| `PORT`                              | yes      | Bound by Replit per artifact; do not hardcode                     |
| `AI_INTEGRATIONS_OPENAI_BASE_URL`   | optional | Set automatically by the Replit OpenAI integration                |
| `AI_INTEGRATIONS_OPENAI_API_KEY`    | optional | Set automatically by the Replit OpenAI integration                |
| `OPENAI_API_KEY`                    | optional | User-provided OpenAI key (alternative to the Replit integration)  |

If either the Replit integration env vars **or** `OPENAI_API_KEY` is present, live mode is
enabled. Otherwise the platform runs in demo mode.

> **Credential precedence:** when both are set, the Replit OpenAI integration
> (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`) is preferred over a
> direct `OPENAI_API_KEY`. The integration handles billing, rotation, and observability
> for you, so it's the recommended path on Replit.

---

## Useful scripts

```bash
pnpm run typecheck                                   # full repo typecheck
pnpm run build                                       # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen        # regenerate hooks + zod from openapi.yaml
pnpm --filter @workspace/db      run push            # push schema (dev only)
pnpm --filter @workspace/api-server run seed         # reseed sample data
```

---

## Where to look first

- `lib/api-spec/openapi.yaml` — the API contract; everything is generated from here
- `artifacts/api-server/src/orchestration/engine.ts` — the workflow state machine
- `artifacts/api-server/src/orchestration/nodes/*.ts` — one file per agent
- `artifacts/api-server/src/lib/llm.ts` — demo / live mode boundary
- `artifacts/agentops/src/pages/workflow-detail.tsx` — the marquee UI surface
- `replit.md` — project conventions, gotchas, and architecture decisions
