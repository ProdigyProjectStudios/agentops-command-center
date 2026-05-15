# AgentOps LangGraph Worker — Phase 1B Spike

**Status:** capability spike only. The Node/Express orchestrator in
`artifacts/api-server` is still the production code path for the
AgentOps demo. This worker exists to prove that the Replit environment
can host a Python/LangGraph service alongside the existing Node API and
React UI, and that Express can call it cleanly over HTTP.

## What lives here

```
artifacts/agent-worker/
├── app.py            # FastAPI app + 4-node LangGraph StateGraph
├── pyproject.toml    # Python deps (langgraph, fastapi, uvicorn, ...)
└── README.md         # this file
```

## How to run it

The workflow `artifacts/agent-worker: Worker` runs:

```
uv run --project artifacts/agent-worker python artifacts/agent-worker/app.py
```

The worker binds to `0.0.0.0` on the port set by `WORKER_PORT`
(defaults to `8000`). Its only two endpoints are:

| Method | Path                | Purpose                                      |
|--------|---------------------|----------------------------------------------|
| GET    | `/worker/health`    | Liveness + Python/LangGraph availability     |
| POST   | `/worker/run-spike` | Run the four-node demo graph and return JSON |

### `/worker/run-spike` request shape

```json
{
  "workflowId": "test-workflow-001",
  "requestText": "We need to onboard a new contractor for a roofing project in Texas."
}
```

### Response shape

```json
{
  "workflowId": "test-workflow-001",
  "status": "completed",
  "nodesRun": ["ops_node", "legal_node", "approval_pause_simulated", "final_node"],
  "state": {
    "classification": "vendor_onboarding",
    "legalRisks": ["Verify W-9, COI, ...", "Roofing contracts must include lien waiver ..."],
    "approvalRequired": true,
    "finalSummary": "Spike workflow test-workflow-001 classified as vendor_onboarding. ..."
  }
}
```

## How Node calls it

The Express server in `artifacts/api-server` exposes two passthrough
routes that proxy to this worker:

| Method | Path                       | Forwards to                |
|--------|----------------------------|----------------------------|
| GET    | `/api/worker/health`       | `GET  /worker/health`      |
| POST   | `/api/worker/run-spike`    | `POST /worker/run-spike`   |

Express reads the worker base URL from `WORKER_BASE_URL` (defaults to
`http://127.0.0.1:8000`). See `artifacts/api-server/src/routes/worker.ts`.

Quick smoke test once both services are running:

```bash
curl -s "$REPLIT_DEV_DOMAIN/api/worker/health" | jq
curl -s -X POST "$REPLIT_DEV_DOMAIN/api/worker/run-spike" \
  -H 'content-type: application/json' \
  -d '{"workflowId":"test-001","requestText":"Onboard a roofing contractor in Texas."}' | jq
```

## Why the worker is separate from the Node API

The Express server's job in production is the **edge**: auth, request
validation, UI-facing reads, and dispatching work. The LangGraph worker's
job is the **engine**: running multi-agent state graphs, holding durable
checkpoints across human approval pauses, and writing structured agent
output back to the same Postgres database.

Two languages, two containers, one database — chosen because:

1. **LangGraph is Python-native.** `interrupt()` + `PostgresSaver`
   checkpointing are first-class primitives in the Python package and
   are the cleanest way to model human-in-the-loop pause/resume.
2. **The Node edge stays small and fast.** Express keeps owning auth,
   validation, system settings, and the UI contract — work that benefits
   from the existing TypeScript codegen pipeline.
3. **Separation of concerns scales.** When pilot workloads grow, the
   worker can scale independently (Reserved VM Deployment) while the
   edge stays on Autoscale.

## How this becomes the production LangGraph orchestration layer later

This spike is intentionally minimal. The path from here to production:

1. **Phase 1B (this spike) — DONE.** Prove the runtime, prove the call
   path, prove the graph machinery.
2. **Phase 1C — vector memory.** Enable `pgvector` (already available
   on this Postgres at version 0.8.0), add an `embedding vector(1536)`
   column on `memory_chunks`, give the worker an embeddings ingest job
   and a hybrid keyword + cosine retrieval tool.
3. **Production graph migration.** Replace the four spike nodes with
   the real eight-node graph already implemented in TypeScript
   (`ops_triage → memory_retrieval → legal_review → finance_review →
   communications → synthesis → approval → finalize`). The worker will
   write to the same `agent_steps`, `tool_calls`, and `activity_logs`
   tables the Node engine writes to today, so the React UI requires
   zero changes.
4. **Real HITL.** Replace `approval_pause_simulated` with a true
   LangGraph `interrupt()` node backed by `PostgresSaver`, persisting
   the graph checkpoint until a human decision is recorded.
5. **Dispatch hardening.** Swap synchronous HTTP dispatch for a
   Postgres `LISTEN/NOTIFY` queue (or a small jobs table polled by the
   worker) so dispatch survives restarts.

The full architecture is documented at `/architecture` in the AgentOps
UI and in the project root `README.md` under "Production extension
path: Python / LangGraph worker."
