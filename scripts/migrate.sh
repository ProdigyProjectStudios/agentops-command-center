#!/usr/bin/env bash
# =============================================================================
# AgentOps — One-command Alembic migration runbook
# =============================================================================
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/migrate.sh           # upgrade to head
#   DATABASE_URL=postgresql://... ./scripts/migrate.sh downgrade # downgrade one step
#   DATABASE_URL=postgresql://... ./scripts/migrate.sh current   # show current rev
#   DATABASE_URL=postgresql://... ./scripts/migrate.sh history   # show full history
#
# Prerequisites:
#   - DATABASE_URL must be set (or exported in your shell / .env).
#   - uv must be installed (https://github.com/astral-sh/uv).
#   - The agent-worker service must have its uv.lock resolved
#     (run `uv sync` in artifacts/agent-worker at least once).
#
# What this does:
#   Runs Alembic migrations against the agentops_py schema in the target
#   database.  The alembic.ini and env.py live in artifacts/agent-worker/alembic/.
#   All migrations are scoped to agentops_py; the public schema is never touched.
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$REPO_ROOT/artifacts/agent-worker"
CMD="${1:-upgrade}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Export it or prefix the command:" >&2
  echo "  DATABASE_URL=postgresql://... ./scripts/migrate.sh" >&2
  exit 1
fi

export DATABASE_URL

echo "==> Working directory : $WORKER_DIR"
echo "==> Alembic command   : $CMD"
echo "==> Target DB         : ${DATABASE_URL%%@*}@***"
echo ""

cd "$WORKER_DIR"

case "$CMD" in
  upgrade)
    uv run alembic upgrade head
    ;;
  downgrade)
    uv run alembic downgrade -1
    ;;
  current)
    uv run alembic current
    ;;
  history)
    uv run alembic history --verbose
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Valid: upgrade | downgrade | current | history"
    exit 1
    ;;
esac

echo ""
echo "==> Done."
