# Approval Queue — End-to-End Test Plan

This file documents the end-to-end UI test for
`artifacts/agentops/src/pages/approvals.tsx`. It is executed with the project's
Playwright-based testing subagent (the `testing` skill / `runTest` function),
seeded by `tests/fixtures/seed-approvals-queue.sql`.

The test exercises the queue across all four approval statuses the page
filters on: `pending`, `approved`, `rejected`, `revision_requested`.

## Coverage matrix

| Done-criterion                                                | Fixture state(s)            |
| ------------------------------------------------------------- | --------------------------- |
| List rendering (card + summary + workflow link)               | pending                     |
| Per-row status badges                                         | pending, approved, rejected, revision_requested |
| Filter tabs scope the queue                                   | all four                    |
| Navigating into a row opens the workflow run                  | pending → workflow detail   |
| Queue refreshes after an approval is decided                  | pending → approved          |

## Fixture seeding

Run `tests/fixtures/seed-approvals-queue.sql` once at the start of the test.
It creates exactly one workflow + approval per status and writes the resulting
ids to `_e2e_approvals_fixtures(state, workflow_id, approval_id,
request_title, summary)`. The seed is idempotent: it deletes prior fixture
rows and the workflows they reference before re-inserting, so re-runs do not
accumulate data. Request titles and summaries are unique-suffixed with a
per-run prefix (`E2E-AQ-<rand>`) so visible-text assertions never collide
with manually seeded data.

The seed depends on `pnpm --filter @workspace/api-server run seed` having
populated the canonical `portfolio_companies` (`acme-industrial`) row.

## Test plan (passed verbatim to `runTest`)

```text
1. [DB] Run the contents of artifacts/agentops/tests/fixtures/seed-approvals-queue.sql.
   Capture the approval_id for each row of the resulting SELECT and refer to
   them as ${pendingId}, ${approvedId}, ${rejectedId}, ${revisionId}, plus
   ${pendingWorkflowId} and ${pendingSummary}.

2. [New Context] Create a new browser context.

3. [Browser] Navigate to /approvals.
4. [Verify] On the default (Pending) view:
   - Assert data-testid="text-page-title" is visible.
   - Assert data-testid="tabs-filter" is visible.
   - Assert data-testid="approval-card-${pendingId}" is visible.
   - Assert data-testid="approval-status-${pendingId}" text matches /pending/i.
   - Assert data-testid="approval-summary-${pendingId}" contains
     "${pendingSummary}".
   - Assert data-testid="link-workflow-${pendingId}" has attribute
     href="/workflows/${pendingWorkflowId}".
   - Assert the decided fixture cards are NOT present:
     approval-card-${approvedId}, approval-card-${rejectedId},
     approval-card-${revisionId}.

5. [Browser] Click data-testid="tab-approved".
6. [Verify]
   - Assert data-testid="approval-card-${approvedId}" is visible.
   - Assert data-testid="approval-status-${approvedId}" text matches /approved/i.
   - Assert data-testid="approval-card-${pendingId}" is NOT present.

7. [Browser] Click data-testid="tab-rejected".
8. [Verify]
   - Assert data-testid="approval-card-${rejectedId}" is visible.
   - Assert data-testid="approval-status-${rejectedId}" text matches /rejected/i.
   - Assert data-testid="approval-card-${approvedId}" is NOT present.

9. [Browser] Click data-testid="tab-revision_requested".
10. [Verify]
    - Assert data-testid="approval-card-${revisionId}" is visible.
    - Assert data-testid="approval-status-${revisionId}" text matches
      /revision/i.

11. [Browser] Click data-testid="tab-all".
12. [Verify] All four fixture cards are visible together
    (approval-card-${pendingId}, approval-card-${approvedId},
    approval-card-${rejectedId}, approval-card-${revisionId}).

13. [Browser] Click data-testid="tab-pending" and then click
    data-testid="link-workflow-${pendingId}".
14. [Verify]
    - URL matches /workflows/${pendingWorkflowId}.
    - data-testid="text-workflow-title" is visible.

15. [Browser] Navigate back to /approvals (Pending tab is the default).
16. [Browser] Click data-testid="button-decide-${pendingId}".
17. [Browser] Clear data-testid="input-decided-by-${pendingId}" and type
    "E2E Queue Reviewer".
18. [Browser] Click data-testid="input-note-${pendingId}" and type
    "approved via queue e2e".
19. [Browser] Click data-testid="button-approve-${pendingId}".
20. [Verify]
    - A toast with title "Approved" appears.
    - data-testid="approval-card-${pendingId}" is no longer present in the
      Pending view (queue refresh removed it).

21. [Browser] Click data-testid="tab-approved".
22. [Verify]
    - data-testid="approval-card-${pendingId}" is visible.
    - data-testid="approval-status-${pendingId}" text matches /approved/i.

23. [DB] Verify the approval persisted:
    SELECT status, decided_by, decision_note FROM approval_requests
    WHERE id = ${pendingId};
    Assert status='approved', decided_by='E2E Queue Reviewer',
    decision_note='approved via queue e2e'.
```

## Re-running

```bash
# 1. Make sure base seed is in place
pnpm --filter @workspace/api-server run seed

# 2. Apply the e2e fixtures (psql against $DATABASE_URL)
psql "$DATABASE_URL" -f artifacts/agentops/tests/fixtures/seed-approvals-queue.sql

# 3. Execute the plan above with the testing subagent (runTest from the
#    `testing` skill). Pass the contents of the "Test plan" code block as the
#    testPlan argument.
```
