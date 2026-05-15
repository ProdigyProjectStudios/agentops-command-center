# AgentOps Command Center

A portfolio-grade multi-agent enterprise operations platform that triages operational requests across portfolio companies through a pipeline of specialized AI agents (Ops, Legal, Finance, Communications, Memory) with human-in-the-loop approval.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `OPENAI_API_KEY` **or** Replit OpenAI integration vars (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`) — when either is present, enables live LLM mode; otherwise the orchestrator runs in deterministic demo mode

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (TypeScript) at `artifacts/api-server`
- Frontend: React Vite at `artifacts/agentops` (preview path `/`)
- DB: PostgreSQL + Drizzle ORM (via `lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval — OpenAPI spec → React Query hooks + Zod schemas
- Build: esbuild

## Where things live

- DB schema: `lib/db/src/schema/` (one table per file, all re-exported via `index.ts`)
- API contract (source of truth): `lib/api-spec/openapi.yaml`
- Generated React Query hooks: `lib/api-client-react/src/generated/`
- Generated Zod schemas: `lib/api-zod/src/generated/`
- API routes (Task #2): `artifacts/api-server/src/routes/`
- Agent orchestrator (Task #2): `artifacts/api-server/src/orchestration/`
- Frontend pages (Task #3/#4): `artifacts/agentops/src/`

## Architecture decisions

- **Node/Express, not Python/FastAPI** — keeps the entire monorepo on a single TypeScript toolchain.
- **Drizzle numeric → string** — `agent_steps.confidence` is `numeric` in PG and surfaces as `string` in API/Zod to avoid runtime drift.
- **Workflow stages are first-class enums** — `workflow_status` (`submitted → triaged → legal_review → finance_review → communications_draft → approval_pending → approved/rejected → finalized/failed`) is the contract the orchestrator state machine drives.
- **`OperationalRequest.workflowRunId`** is a join projection, not a column — handlers project it explicitly.
- **Demo-mode-first orchestrator** — pipeline produces deterministic output without an API key, so the platform is always demoable.
- **Internal-only DB models** — `users` and `memory_chunks` are intentionally excluded from the public API contract (`lib/api-spec/openapi.yaml`). They are server-side concerns: `users` backs `requestedBy` / `decidedBy` attribution and future auth, and `memory_chunks` is used internally by the Memory agent for retrieval. They may be exposed later if a UI need arises.

## Product

The Command Center triages incoming operational requests for a portfolio firm:

1. An operator submits a request (e.g. "Approve $50K marketing spend for Acme Co").
2. The Ops agent triages it and routes to the right specialist agents.
3. Legal, Finance, and Communications agents review in sequence, each producing a recommendation, risk score, and tool calls.
4. The Memory agent grounds responses in a knowledge base.
5. The workflow lands at a human approval gate with a summary, risk level, and recommendation; the operator approves, rejects, or requests revision.

## User preferences

- Execute tasks sequentially in the approved 5-task plan; do not parallelize dependent tasks.
- Stop after each task for audit before continuing to the next.

## Gotchas

- Always re-run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml`.
- Body schemas in OpenAPI must use entity-shaped names (e.g. `OperationalRequestInput`), never `<OperationId>Body`, to avoid TS2308 collisions.
- Nullable scalars in OpenAPI must use `type: ["<type>", "null"]`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `react-vite` skill for frontend conventions
