---
name: Shared pythonlibs anyio version conflict
description: Two uv projects (api-python, agent-worker) sharing .pythonlibs fight over anyio version on every uv sync, leaving a broken mixed install that causes ImportError at request time.
---

When two separate uv projects both use `.pythonlibs` as their package store
(Replit default), running `uv sync` in one project can downgrade packages that
the other project upgraded, leaving a partially mixed install.

**Symptom:** `ImportError: cannot import name 'TaskHandle' from 'anyio._core._tasks'`
inside the running service at request time (not at startup), because startup
pre-imports succeed but the request threadpool hits the broken anyio backend.

**Root cause (deep):** FastAPI wraps sync `def` route handlers with
`anyio.to_thread.run_sync`. That call hits `anyio._backends._asyncio`, which
in anyio 4.x imports `TaskHandle` from `_core._tasks`. If `_tasks.py` was
overwritten by a 3.x sync, the import fails — even if startup succeeded.

**Fix (two-part):**
1. Pin matching versions — add `anyio>=4.0` and `uvicorn>=0.51.0` to *both*
   pyproject.toml files so uv syncs are idempotent and don't swap each other.
2. Make ALL FastAPI route handlers `async def` — this eliminates the
   `anyio.to_thread` wrapping path entirely. FastAPI only uses anyio thread
   pooling for sync `def` handlers; async handlers run directly.

**Run proof scripts with `uv run --no-sync`** to avoid triggering a sync that
swaps packages under a running service.

**How to apply:** Whenever adding a new uv project to this workspace that shares
.pythonlibs, check that core async deps (anyio, httpx, uvicorn, starlette)
resolve to the same version across all projects, and declare all route handlers
as `async def` from the start.
