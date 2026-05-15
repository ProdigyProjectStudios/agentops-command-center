# Workflow Run Detail — End-to-End Test Plan

This file documents the end-to-end UI test for
`artifacts/agentops/src/pages/workflow-detail.tsx`. It is executed with the
project's Playwright-based testing subagent (the `testing` skill / `runTest`
function), seeded by `tests/fixtures/seed-workflow-detail.sql`.

The test exercises the page across all five workflow states it must render:
`submitted`, `running`, `approval_pending`, `finalized`, `failed`.

## Coverage matrix

| Done-criterion                                                   | Fixture state(s)            |
| ---------------------------------------------------------------- | --------------------------- |
| Graph timeline shows correct status colors                       | all 5                       |
| Clicking a graph node scrolls to its agent panel                 | approval_pending            |
| Agent tabs switch correctly                                      | approval_pending (legal)    |
| Retrieved memory section appears when memory hits exist          | approval_pending            |
| Approval form submits                                            | approval_pending            |
| Final executive brief renders only when finalized                | finalized vs. the other 4   |

## Fixture seeding

Run `tests/fixtures/seed-workflow-detail.sql` once at the start of the test.
It creates exactly one workflow per state and writes the resulting ids to
`_e2e_workflow_fixtures(state, workflow_id, approval_id, request_title)`.
The seed is idempotent: it deletes prior fixture rows and the workflows they
reference before re-inserting, so re-runs do not accumulate data.

The seed depends on `pnpm --filter @workspace/api-server run seed` having
populated the canonical `portfolio_companies` (`acme-industrial`) and `agents`
(`ops-conductor`, `legal-counsel`, `finance-analyst`, `communications`,
`memory-keeper`) rows.

## Test plan (passed verbatim to `runTest`)

```text
1. [DB] Run the contents of artifacts/agentops/tests/fixtures/seed-workflow-detail.sql.
   Capture the workflow_id for each row of the resulting SELECT and refer to
   them as ${submittedId}, ${runningId}, ${approvalPendingId}, ${finalizedId},
   ${failedId}. Also capture ${approvalId} for the approval_pending row.

2. [New Context] Create a new browser context.

3. [Browser] Navigate to /workflows/${submittedId}.
4. [Verify] On the submitted fixture:
   - Assert data-testid="graph-timeline" is visible.
   - Assert data-testid="graph-node-ops_triage" has attribute data-status="pending".
   - Assert data-testid="graph-node-finalize" has attribute data-status="pending".
   - Assert data-testid="section-final-brief" is NOT present.
   - Assert data-testid="section-retrieved-memory" is NOT present.
   - Assert data-testid="empty-agents" is visible (no steps yet).
   - Assert data-testid="button-run-workflow" is visible (run is allowed).

5. [Browser] Navigate to /workflows/${runningId}.
6. [Verify] On the running fixture:
   - Assert data-testid="graph-node-ops_triage" has data-status="completed".
   - Assert data-testid="graph-node-memory_retrieval" has data-status="running".
   - Assert data-testid="graph-node-legal_review" has data-status="pending".
   - Assert data-testid="section-final-brief" is NOT present.

7. [Browser] Navigate to /workflows/${approvalPendingId}.
8. [Verify] On the approval_pending fixture:
   - Assert all of these graph nodes have data-status="completed":
     graph-node-ops_triage, graph-node-memory_retrieval,
     graph-node-legal_review, graph-node-finance_review,
     graph-node-communications, graph-node-approval.
   - Assert data-testid="graph-node-finalize" has data-status="pending".
   - Assert data-testid="section-retrieved-memory" is visible (memory hits seeded).
   - Assert data-testid="memory-hit-99901" is visible inside it.
   - Assert data-testid="section-tool-calls" is visible.
   - Assert data-testid="section-approval-decision" is visible.
   - Assert data-testid="section-final-brief" is NOT present (no synthesis step).

9. [Browser] Click data-testid="graph-node-legal_review".
10. [Verify] data-testid="agent-panel-legal_review" is in the viewport
    (scrollIntoView triggered by the click).

11. [Browser] If data-testid="agent-panel-legal_review" is collapsed, click
    data-testid="agent-header-legal_review" to expand it.
12. [Browser] Click data-testid="tab-summary-legal_review".
13. [Verify] data-testid="summary-legal_review" is visible and contains the
    text "Vendor warranty acceptable".
14. [Browser] Inside agent-panel-legal_review, click the "Findings" tab
    (the TabsTrigger sibling of tab-summary-legal_review).
15. [Verify] The findings list item containing "Warranty: 10 years" is visible
    and the summary paragraph from the previous tab is no longer visible.

16. [Browser] In the approval form, clear data-testid="input-approver" and
    type "E2E Reviewer".
17. [Browser] Click data-testid="input-note" and type "approved by e2e".
18. [Browser] Click data-testid="button-approve".
19. [Verify]
    - A toast with title "Approved" appears.
    - data-testid="badge-approval-status" updates to text "approved".
    - data-testid="text-decided-by" contains "E2E Reviewer".
    - data-testid="text-decision-note" contains "approved by e2e".
    - data-testid="input-approver" and data-testid="button-approve" are no
      longer present (form is replaced by the decided summary).

20. [DB] Verify the approval persisted:
    SELECT status, decided_by, decision_note FROM approval_requests
    WHERE id = ${approvalId};
    Assert status='approved', decided_by='E2E Reviewer',
    decision_note='approved by e2e'.

21. [Browser] Navigate to /workflows/${finalizedId}.
22. [Verify] On the finalized fixture:
    - Assert data-testid="section-final-brief" is visible.
    - Assert data-testid="brief-summary" contains "E2E executive summary text".
    - Assert data-testid="brief-recommendation" contains
      "Approve vendor with conditions".
    - Assert data-testid="brief-evidence-0" and data-testid="brief-next-action-0"
      are visible.
    - Assert data-testid="badge-status" reflects the finalized state.

23. [Browser] Navigate to /workflows/${failedId}.
24. [Verify] On the failed fixture:
    - Assert data-testid="graph-node-ops_triage" has data-status="completed".
    - Assert data-testid="graph-node-legal_review" has data-status="failed".
    - Assert data-testid="graph-node-finance_review" has data-status="skipped".
    - Assert data-testid="graph-node-finalize" has data-status="skipped".
    - Assert data-testid="section-final-brief" is NOT present.
    - Assert data-testid="button-run-workflow" is visible (failed runs are
      re-runnable).
```

## Re-running

```bash
# 1. Make sure base seed is in place
pnpm --filter @workspace/api-server run seed

# 2. Apply the e2e fixtures (psql against $DATABASE_URL)
psql "$DATABASE_URL" -f artifacts/agentops/tests/fixtures/seed-workflow-detail.sql

# 3. Execute the plan above with the testing subagent (runTest from the
#    `testing` skill). Pass the contents of the "Test plan" code block as the
#    testPlan argument.
```
