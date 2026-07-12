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

**Root cause:** agent-worker's uv.lock pinned anyio 3.x; api-python's pulled
anyio 4.x. Each `uv sync` would partially overwrite the other's files.

**Fix:** Add `anyio>=4.0` to agent-worker's `pyproject.toml` dependencies so
both projects resolve to the same major version. Then `uv sync` + restart.

**How to apply:** Whenever adding a new uv project to this workspace that shares
.pythonlibs, check that core async deps (anyio, httpx, uvicorn, starlette)
resolve to the same version across all projects before running either service.
