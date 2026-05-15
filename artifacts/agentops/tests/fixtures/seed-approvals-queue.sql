-- E2E fixture seeder for the Approval Queue page (artifacts/agentops/src/pages/approvals.tsx).
--
-- Creates one workflow + one approval per status the queue must render:
--   pending, approved, rejected, revision_requested
--
-- Writes the resulting approval/workflow ids (and the per-row request_title /
-- summary used for visible-text assertions) to a regular table named
-- `_e2e_approvals_fixtures` so the test can read them back via a single SELECT
-- after the seed runs.
--
-- This script is idempotent: it deletes any prior fixtures, the workflows and
-- requests they reference, and unique-suffixes request titles / summaries with
-- a per-run prefix so it never conflicts with manually seeded data or earlier
-- test runs.

CREATE TABLE IF NOT EXISTS _e2e_approvals_fixtures (
  state          text PRIMARY KEY,
  workflow_id    int  NOT NULL,
  approval_id    int  NOT NULL,
  request_title  text NOT NULL,
  summary        text NOT NULL
);

-- Drop prior fixture rows and the workflow/request rows they reference. Order
-- matters: capture the request ids BEFORE deleting workflow_runs, otherwise
-- the request-cleanup subquery would join against rows that were just removed
-- and silently leave orphan operational_requests behind.
DELETE FROM operational_requests
  WHERE id IN (
    SELECT request_id FROM workflow_runs
    WHERE id IN (SELECT workflow_id FROM _e2e_approvals_fixtures)
  );
DELETE FROM workflow_runs WHERE id IN (SELECT workflow_id FROM _e2e_approvals_fixtures);
DELETE FROM _e2e_approvals_fixtures;

DO $$
DECLARE
  v_company_id   int;
  v_request_id   int;
  v_wf_id        int;
  v_approval_id  int;

  v_prefix       text := 'E2E-AQ-' || substr(md5(random()::text), 1, 8);
  v_title        text;
  v_summary      text;
BEGIN
  SELECT id INTO v_company_id FROM portfolio_companies WHERE slug = 'acme-industrial' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing: portfolio_companies.slug=acme-industrial. Run `pnpm --filter @workspace/api-server run seed` first.';
  END IF;

  ----------------------------------------------------------------------
  -- 1) pending: brand-new approval awaiting a decision
  ----------------------------------------------------------------------
  v_title   := v_prefix || ' pending';
  v_summary := v_prefix || ' pending summary text.';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E queue: pending approval.', 'Operations', 'high', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at)
  VALUES (v_request_id, 'approval_pending', 'approval_pending', 'medium', 100000,
          NOW() - INTERVAL '2 minutes')
  RETURNING id INTO v_wf_id;

  INSERT INTO approval_requests (workflow_run_id, status, risk_level, summary, recommendation)
  VALUES (v_wf_id, 'pending', 'medium', v_summary,
          v_prefix || ' approve recommendation.')
  RETURNING id INTO v_approval_id;

  INSERT INTO _e2e_approvals_fixtures (state, workflow_id, approval_id, request_title, summary)
  VALUES ('pending', v_wf_id, v_approval_id, v_title, v_summary);

  ----------------------------------------------------------------------
  -- 2) approved: decided, should appear in the Approved tab
  ----------------------------------------------------------------------
  v_title   := v_prefix || ' approved';
  v_summary := v_prefix || ' approved summary text.';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E queue: already approved.', 'Operations', 'medium', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at, completed_at)
  VALUES (v_request_id, 'approved', 'approved', 'low', 100000,
          NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '5 minutes')
  RETURNING id INTO v_wf_id;

  INSERT INTO approval_requests
    (workflow_run_id, status, risk_level, summary, recommendation,
     decided_by, decision_note, decided_at)
  VALUES (v_wf_id, 'approved', 'low', v_summary,
          v_prefix || ' approve recommendation.',
          'E2E Operator', 'looks good', NOW() - INTERVAL '5 minutes')
  RETURNING id INTO v_approval_id;

  INSERT INTO _e2e_approvals_fixtures (state, workflow_id, approval_id, request_title, summary)
  VALUES ('approved', v_wf_id, v_approval_id, v_title, v_summary);

  ----------------------------------------------------------------------
  -- 3) rejected: decided, should appear in the Rejected tab
  ----------------------------------------------------------------------
  v_title   := v_prefix || ' rejected';
  v_summary := v_prefix || ' rejected summary text.';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E queue: already rejected.', 'Operations', 'medium', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at, completed_at)
  VALUES (v_request_id, 'rejected', 'rejected', 'high', 100000,
          NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '12 minutes')
  RETURNING id INTO v_wf_id;

  INSERT INTO approval_requests
    (workflow_run_id, status, risk_level, summary, recommendation,
     decided_by, decision_note, decided_at)
  VALUES (v_wf_id, 'rejected', 'high', v_summary,
          v_prefix || ' reject recommendation.',
          'E2E Operator', 'not acceptable', NOW() - INTERVAL '12 minutes')
  RETURNING id INTO v_approval_id;

  INSERT INTO _e2e_approvals_fixtures (state, workflow_id, approval_id, request_title, summary)
  VALUES ('rejected', v_wf_id, v_approval_id, v_title, v_summary);

  ----------------------------------------------------------------------
  -- 4) revision_requested: decided, should appear in the Revision tab
  ----------------------------------------------------------------------
  v_title   := v_prefix || ' revision';
  v_summary := v_prefix || ' revision summary text.';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E queue: revision requested.', 'Operations', 'medium', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at)
  VALUES (v_request_id, 'submitted', 'submitted', 'medium', 100000,
          NOW() - INTERVAL '20 minutes')
  RETURNING id INTO v_wf_id;

  INSERT INTO approval_requests
    (workflow_run_id, status, risk_level, summary, recommendation,
     decided_by, decision_note, decided_at)
  VALUES (v_wf_id, 'revision_requested', 'medium', v_summary,
          v_prefix || ' approve recommendation.',
          'E2E Operator', 'please clarify', NOW() - INTERVAL '17 minutes')
  RETURNING id INTO v_approval_id;

  INSERT INTO _e2e_approvals_fixtures (state, workflow_id, approval_id, request_title, summary)
  VALUES ('revision_requested', v_wf_id, v_approval_id, v_title, v_summary);
END $$;

SELECT state, workflow_id, approval_id, request_title, summary
FROM _e2e_approvals_fixtures
ORDER BY
  CASE state
    WHEN 'pending' THEN 1
    WHEN 'approved' THEN 2
    WHEN 'rejected' THEN 3
    WHEN 'revision_requested' THEN 4
  END;
