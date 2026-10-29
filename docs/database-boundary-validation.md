# Database boundary follow-up

All four previously blocked test files passed against an isolated, seeded PGlite PostgreSQL database exposed over TCP through the application's unchanged `pg` pool and Drizzle adapter.

| Test file | Passed | Scope |
| --- | ---: | --- |
| `base-agent.test.ts` | 3 | Agent envelopes, mocked model responses/fallback and confidence clamping |
| `keyword-search.test.ts` | 3 | Tokenization only; database connection was previously required by imports |
| `node-boundary.test.ts` | 4 | Ops, Legal, Finance and Synthesis node → BaseAgent → envelope/schema boundary |
| `orchestration-keys.test.ts` | 3 | Stable pipeline keys and step-name mapping; imports require database configuration |
| **Total** | **13** | **Zero failures, skips or cancellations** |

## Environment and checks

- Node 24.22.1, PGlite 0.5.13 (PostgreSQL 18.6), `@electric-sql/pglite-socket` 0.2.16; loopback-only listener, ten permitted connections. Test files ran sequentially. No production database was accessed or modified.
- Fixture tables: `agents`, `system_settings`, `llm_usage`. The agent/status and settings columns match the application schema. The telemetry fixture omits the workflow foreign key because these tests have no persisted workflow; this is not a full-schema migration or foreign-key validation.
- Seeded the five application agent slugs plus test agent `x`, default model `qa-seeded-default`, and Ops override `qa-seeded-ops`. A preflight through the application's model-settings functions confirmed all six rows, the database's PostgreSQL version and the test-specific override. These model names are deliberate sentinels, never provider requests.
- Final successful log contained no database-fallback, connection-termination or telemetry-write errors. Expected mocked empty-model-response fallback and Node experimental/deprecation warnings remain.
- Provider credentials were removed from the runner; the base-agent tests supply their own mocked client. The specialist boundary uses documented demo outputs. No successful live model inference is claimed.
- API TypeScript check passed after the test guard change.

## False-positive prevention

`getModelForAgent()` intentionally falls back to an environment/default model if a database lookup fails. The previous node-boundary tests could therefore pass with an unreachable database despite claiming to require one.

The suite now performs an uncaught settings read, requires the Ops/Legal/Finance seed rows, checks model resolution against those settings and closes its pool after tests. A negative-control run pointed at an unavailable loopback port failed the suite's setup, confirming it can no longer silently pass through a missing-database fallback.

## Reproduce on the normal seeded test database

Use the existing CI PostgreSQL service/schema/seed setup, or another disposable seeded test database. Never run the repository's truncating seed script against production. With `DATABASE_URL` set to that test database, run from `artifacts/api-server`:

```bash
node --test --test-concurrency=1 --experimental-test-module-mocks --import tsx \
  src/__tests__/base-agent.test.ts \
  src/__tests__/keyword-search.test.ts \
  src/__tests__/node-boundary.test.ts \
  src/__tests__/orchestration-keys.test.ts
```

The embedded verification closes the four local test-file gaps. It does not verify native production PostgreSQL behavior, the entire eight-node workflow, Python services, live AI, external integrations, deployment or restart durability. Existing GitHub CI already provisions native PostgreSQL with pgvector and runs schema setup/seeding; that remains the production-like database check.
