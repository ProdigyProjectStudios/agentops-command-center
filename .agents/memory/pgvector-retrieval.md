---
name: pgvector semantic retrieval
description: Task 47 — what was built, what works, and durable constraints for the vector retrieval layer.
---

## What was built

- **Alembic migration** `e1a2b3c4d5f6` — `CREATE EXTENSION IF NOT EXISTS vector` after `c7f3a2b1d4e5`. Downgrade is a deliberate no-op.
- **`memory_store.backfill_embeddings(batch_size)`** — idempotent function that embeds all `memory_chunks WHERE embedding IS NULL`, batch-commits, returns `{processed, skipped, failed}`.
- **`artifacts/agent-worker/backfill_embeddings.py`** — CLI wrapper: `uv run python backfill_embeddings.py [--batch-size N] [--dry-run]`. Exit 1 on any failures.
- **`/worker/memory/search-spike`** — route path unchanged (hardcoded in api-python/main.py:671). Internal comments updated to remove "spike" framing; it is the stable production retrieval path.
- **`api-python/tests/test_retrieval.py`** — 10 deterministic tests (see below).

## Active retrieval chain

```
POST /assess/{workflow_id}
 → api-python/main.py:670  httpx.post(worker/memory/search-spike)
 → agent-worker/app.py::search_spike()
    1. embed_text(query)           — live OpenAI or demo fallback
    2. vector_search(vec, limit)   — cosine distance (<=>), WHERE embedding IS NOT NULL
    3. if raises or 0 rows → keyword_search(query, limit)
    4. if keyword fails too → mode="empty" (non-fatal)
 → retrieval_mode / retrieval_chunks_used in AssessmentResponse
```

## Constraints that must not change without caller updates

- Route path `/worker/memory/search-spike` is hardcoded in `api-python/main.py:671`.
- `AssessmentResponse` fields `retrieval_mode` and `retrieval_chunks_used` exist in `api-python/models.py`.
- The `backfill_embeddings` function does `WHERE id = %s AND embedding IS NULL` in the UPDATE — this is the idempotency guard.

## Embedding mode in tests

`embed_text()` returns `mode="demo"` in subprocess/test contexts because the `AI_INTEGRATIONS_OPENAI_BASE_URL` proxy is not accessible from `uv run python -` one-liners. All tests use `_demo_embedding()` directly so this is irrelevant — tests are fully deterministic. Live production calls (via the running FastAPI process) use the live embedding path correctly.

## Known gap

`test_job_retries_with_backoff_hits_max_ceiling` in `test_pipeline.py` has a pre-existing race condition: the running agent-worker process claims the test's queued job between loop iterations. Not caused by Task 47. Fix requires either stopping the worker during the test or setting `next_retry_at` far in the future before claiming.

## What was already there (not added by Task 47)

- `memory_chunks.embedding vector(1536)` column — Drizzle-owned, already existed
- `memory_store.vector_search()`, `memory_store.keyword_search()` — already existed
- 7 policy chunks already fully embedded (no NULL rows remain after prior spike work)
