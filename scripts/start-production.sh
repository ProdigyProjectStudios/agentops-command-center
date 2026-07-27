#!/bin/sh
# Production startup script.
# Launches the Python FastAPI service in the background, then hands
# control to the Node API server in the foreground (which is the
# process the deployment health monitor watches).

set -e

# Run agentops_py schema migrations before starting services.
# Must cd into agent-worker so env.py can import models.py from that directory.
(cd artifacts/agent-worker && uv run alembic upgrade head)

# Start Python FastAPI service (background).
# uv picks up api-python/pyproject.toml via the --project flag so the
# correct virtualenv and dependencies are used regardless of CWD.
PORT=8008 uv run --project api-python python api-python/main.py &

# Give FastAPI a moment to bind before Node starts accepting traffic,
# so the first proxied request doesn't race with startup.
sleep 2

# Start Node API server (foreground — this is the main monitored process).
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
