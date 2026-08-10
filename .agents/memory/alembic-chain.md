---
name: Alembic migration chain
description: Current agentops_py Alembic revision chain and rules for adding new migrations.
---

Chain (oldest → newest):
  9ce2a95ea123 → 8b8b949048ec → b9e2f4a1c5d8 → c7f3a2b1d4e5 → e1a2b3c4d5f6 (head)

c7f3a2b1d4e5 = create_voice_tables (voice_calls, voice_call_events)
e1a2b3c4d5f6 = enable_pgvector_extension (CREATE EXTENSION IF NOT EXISTS vector; downgrade is no-op)

**Why:** Alembic in agent-worker uses asyncpg + version_table_schema="agentops_py". Every migration must set down_revision to the current head before `alembic upgrade head`. Wrong down_revision creates a branch and breaks future upgrades.

**How to apply:** Before writing a new migration file, run `alembic heads` to confirm current head. Set `down_revision` to that value. Run `alembic upgrade head` from `artifacts/agent-worker/`.
