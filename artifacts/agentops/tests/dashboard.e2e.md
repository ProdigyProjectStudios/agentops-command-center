# Operations Dashboard — End-to-End Test Plan

This file documents the end-to-end UI test for
`artifacts/agentops/src/pages/dashboard.tsx`. It is executed with the
project's Playwright-based testing subagent (the `testing` skill / `runTest`
function), seeded by `tests/fixtures/seed-dashboard.sql` and exercised by
`tests/e2e/dashboard.spec.ts`.

The dashboard aggregates metrics across **all** workflows in the database, so
asserting raw metric values would be brittle. Instead, the seed snapshots a
**baseline** of each metric input before inserting fixture rows with a
**known delta**; the spec asserts `expected = baseline + delta` exactly.

## Coverage matrix

| Done-criterion                                                | Fixture state(s)              |
| ------------------------------------------------------------- | ----------------------------- |
| Dashboard loads with seeded fixture data                      | all 3                         |
| Metric tiles show the expected counts                         | all 3 (baseline + delta)      |
| Recent activity list renders entries from seeded workflows    | all 3 activity rows           |
| Recent workflows list renders seeded workflow rows            | all 3 workflow rows           |

## Fixture seeding

Run `tests/fixtures/seed-dashboard.sql` once at the start of the test. It:

1. Captures baseline values of every metric input the dashboard route reads
   (`workflow_runs`, `approval_requests`, `agent_steps`).
2. Inserts three fixture workflows with a hardcoded contribution to each
   metric:
   - **WF1** — `approval_pending`, risk `high`, $3,000 cost. Adds +1 active
     workflow, +1 pending approval, +1 compliance risk, $3,000 cost, +1
     agent step today, +1 activity entry.
   - **WF2** — `triaged`, risk `low`, $1,500 cost. Adds +1 active workflow,
     $1,500 cost, +1 agent step today, +1 activity entry.
   - **WF3** — `finalized`, risk `low`, $5,000 cost. Adds $5,000 cost (the
     dashboard counts finalized cost), +1 agent step today, +1 activity
     entry.
3. Writes the baselines + fixture ids + a per-run prefix to
   `_e2e_dashboard_fixtures(key text PRIMARY KEY, num_value bigint,
   text_value text)` so the spec can read them back via a single SELECT.

The seed is idempotent: it deletes prior fixture rows and the workflows /
activity entries they reference before re-inserting, so re-runs do not
accumulate data. Request titles are unique-suffixed with a per-run prefix
(`E2E-DASH-<rand>`) so visible-text assertions never collide with manually
seeded data or earlier test runs.

The seed depends on `pnpm --filter @workspace/api-server run seed` having
populated the canonical `portfolio_companies` (`acme-industrial`) and
`agents` (`ops-conductor`) rows.

> **Important isolation note:** other specs in this suite (notably
> `approvals.spec.ts`) mutate dashboard metric inputs at runtime — for
> example by flipping a pending approval to approved. The dashboard
> baseline must therefore be captured **immediately before** the
> assertions, not at global-setup time. `dashboard.spec.ts` accordingly
> re-runs `seedDashboardFixtures()` in its own `beforeAll` rather than
> reusing a cached `E2E_DASHBOARD_FIXTURES` value, and `global-setup.ts`
> intentionally does not pre-seed the dashboard fixture.

## Resulting deltas (mirrored in `DASHBOARD_DELTAS` in `global-setup.ts`)

| Metric                       | Delta    |
| ---------------------------- | -------- |
| `activeWorkflows`            | +2       |
| `pendingApprovals`           | +1       |
| `agentActionsToday`          | +3       |
| `complianceRisksFlagged`     | +1       |
| `estimatedCostImpactCents`   | +950000  |

## Test plan (passed verbatim to `runTest`)

```text
1. [DB] Run the contents of artifacts/agentops/tests/fixtures/seed-dashboard.sql.
   Capture the resulting rows from _e2e_dashboard_fixtures and refer to them
   as ${baselineActive}, ${baselinePending}, ${baselineToday},
   ${baselineRisks}, ${baselineCost}, ${wf1Id}, ${wf2Id}, ${wf3Id},
   ${act1Id}, ${act2Id}, ${act3Id}, ${title1}, ${msg1}.

2. [New Context] Create a new browser context.

3. [Browser] Navigate to /.
4. [Verify] data-testid="text-page-title" is visible.

5. [Verify] Metric tiles show baseline + seeded delta:
   - data-testid="metric-active-workflows-value" text equals
     (${baselineActive} + 2).
   - data-testid="metric-pending-approvals-value" text equals
     (${baselinePending} + 1).
   - data-testid="metric-agent-actions-value" text equals
     (${baselineToday} + 3).
   - data-testid="metric-compliance-risks-value" text equals
     (${baselineRisks} + 1).
   - data-testid="metric-cost-impact-value" is not "—" and contains a digit
     (it is rendered through formatCurrencyCents and includes the seeded
     +$9,500 of estimated cost impact).

6. [Verify] Recent workflows list renders seeded rows:
   - data-testid="row-workflow-${wf1Id}" is visible.
   - data-testid="row-workflow-${wf2Id}" is visible.
   - data-testid="row-workflow-${wf3Id}" is visible.
   - data-testid="row-workflow-${wf1Id}" contains the text ${title1}.
   - data-testid="badge-status-${wf1Id}" is visible.

7. [Verify] Recent activity list renders seeded entries:
   - For each (${actNId}, ${msgN}) in the three seeded activity rows:
     - data-testid="activity-${actNId}" is visible.
     - data-testid="activity-${actNId}" contains ${msgN}.
     - data-testid="activity-${actNId}" contains the actor "e2e-dashboard".
```

## Re-running

```bash
# 1. Make sure the base seed is in place
pnpm --filter @workspace/api-server run seed

# 2. Apply the e2e fixtures (psql against $DATABASE_URL)
psql "$DATABASE_URL" -f artifacts/agentops/tests/fixtures/seed-dashboard.sql

# 3. Execute the plan above with the testing subagent (runTest from the
#    `testing` skill). Pass the contents of the "Test plan" code block as the
#    testPlan argument, or simply run the spec directly:
pnpm --filter @workspace/agentops exec playwright test tests/e2e/dashboard.spec.ts
```
