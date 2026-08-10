# AgentOps Agent Worker

Python background service that provides vector embedding storage, cosine similarity search, and the Alembic migration chain for the `agentops_py` schema.

This is active production code. The worker runs alongside the Node API server and the Python FastAPI assessment service (`api-python`).

---

## What lives here

```
artifacts/agent-worker/
├── app.py                  # FastAPI app + worker loop + embedding + memory search endpoints
├── memory_store.py         # pgvector embedding storage and cosine similarity retrieval
├── backfill_embeddings.py  # CLI: idempotent backfill of NULL embedding rows
├── pyproject.toml          # Python deps (fastapi, uvicorn, openai, psycopg, pgvector, ...)
├── alembic/                # Alembic migration files for agentops_py schema
│   └── versions/           # Migration chain: head = e1a2b3c4d5f6
└── README.md               # this file
```

---

## How to run it

The workflow `artifacts/agent-worker: Worker` runs:

```bash
uv run --project artifacts/agent-worker python artifacts/agent-worker/app.py
```

The worker binds to `0.0.0.0` on port `8000` (or `WORKER_PORT` env var). Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/worker/health` | Liveness check |
| `POST` | `/worker/memory/embed-spike` | Embed text and store in `memory_chunks` |
| `POST` | `/worker/memory/search-spike` | Cosine similarity search over `memory_chunks.embedding`; keyword fallback |

> **Note:** the `search-spike` path is stable and hardcoded in `api-python/main.py`. Do not rename it.

---

## Embedding backfill

New policy documents added to `knowledge_documents` must be explicitly chunked and embedded. The backfill CLI embeds all `memory_chunks` rows where `embedding IS NULL`:

```bash
cd artifacts/agent-worker

# Embed all NULL rows (idempotent — skips already-embedded rows)
uv run python backfill_embeddings.py

# Preview without writing
uv run python backfill_embeddings.py --dry-run

# Control batch size
uv run python backfill_embeddings.py --batch-size 20
```

Exit code 1 if any rows failed. Requires `OPENAI_API_KEY` or Replit integration credentials for live embedding. Demo embeddings (fixed-dimension deterministic vectors) are used by tests and when no credentials are present.

---

## Retrieval path

The `/worker/memory/search-spike` endpoint called by `api-python/main.py`:

```
Query string
  → embed query (text-embedding-3-small, or deterministic demo vector)
  → pgvector cosine search: memory_chunks.embedding <=> query_vec (top-k)
  → if no hits: keyword fallback (ILIKE token matching)
  → return ranked hits: [{documentId, title, category, snippet, score}]
  → retrieval_mode: "vector" | "keyword"
```

The `memory_store.py` module owns the embedding storage and retrieval logic. The `search_spike()` function is the active retrieval entry point.

---

## Alembic migration chain

Schema: `agentops_py`. Current head: `e1a2b3c4d5f6`.

To apply migrations:

```bash
cd artifacts/agent-worker
uv run alembic upgrade head
```

To create a new migration, always set `down_revision` to the current head before running `alembic revision`. The `CREATE EXTENSION IF NOT EXISTS vector` migration runs early in the chain; the downgrade is a deliberate no-op (extensions are shared resources).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | No | Live embedding calls; deterministic demo embeddings used without it |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | No | Replit-managed alternative to `OPENAI_API_KEY` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | Paired with `AI_INTEGRATIONS_OPENAI_API_KEY` |
| `WORKER_PORT` | No | Bind port (default: `8000`) |

---

## How the Node API calls the worker

The Express server in `artifacts/api-server` exposes passthrough routes that proxy to this worker:

| Method | Path | Forwards to |
|---|---|---|
| `GET` | `/api/worker/health` | `GET /worker/health` |
| `POST` | `/api/worker/memory/embed-spike` | `POST /worker/memory/embed-spike` |
| `POST` | `/api/worker/memory/search-spike` | `POST /worker/memory/search-spike` |

Express reads the worker base URL from `WORKER_BASE_URL` (defaults to `http://127.0.0.1:8000`).
