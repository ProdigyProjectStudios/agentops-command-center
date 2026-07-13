---
name: Port conflicts on Replit
description: Orphan processes on ports 8000/8008 block workflow restarts after multiple rapid restarts.
---

After multiple rapid restarts (e.g. during a build session), uvicorn processes from previous runs hold ports 8000 (agent-worker) and 8008 (api-python). The new process starts, logs "Application startup complete", then immediately fails with "address already in use".

**Fix:** Run `fuser -k 8000/tcp 8008/tcp 2>/dev/null; sleep 1` before restarting the workflows.

**Why it happens:** Replit's workflow runner sends SIGTERM but the process may not have fully released the port socket before the next restart attempt.
