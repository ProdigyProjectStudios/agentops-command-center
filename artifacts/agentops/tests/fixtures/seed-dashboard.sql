-- E2E fixture seeder for the Operations Dashboard page
-- (artifacts/agentops/src/pages/dashboard.tsx).
--
-- The dashboard aggregates metrics across ALL workflows in the database,
-- so this seed:
--   1. Captures BASELINE metric inputs from the existing DB state.
--   2. Inserts a known set of fixture workflows + activity entries with a
--      KNOWN delta on each metric.
--   3. Writes both the baseline values and the fixture ids to
--      `_e2e_dashboard_fixtures` so the spec can compute
--      expected_value = baseline + (hardcoded delta) and assert exactly.
--
-- Fixture contributions (matched in tests/e2e/global-setup.ts as
-- DASHBOARD_DELTAS):
--   WF1: status=approval_pending, risk=high, cost=$3,000, +1 step today,
--        +1 pending approval, +1 activity entry
--   WF2: status=triaged,          risk=low,  cost=$1,500, +1 step today,
--        +1 activity entry
--   WF3: status=finalized,        risk=low,  cost=$5,000, +1 step today,
--        +1 activity entry
--
-- Resulting deltas vs. baseline:
--   activeWorkflows         +2  (WF1 + WF2)
--   pendingApprovals        +1  (WF1)
--   agentActionsToday       +3  (one agent_step per WF, created_at = NOW())
--   complianceRisksFlagged  +1  (WF1: high risk and not finalized)
--   estimatedCostImpactCents +950000  (WF1 + WF2 + WF3, all non-rejected/failed)
--
-- The seed is idempotent: it deletes prior fixture rows (and the workflows /
-- activity entries they reference) before re-inserting, so re-runs do not
-- accumulate data. Request titles are unique-suffixed with a per-run prefix
-- (`E2E-DASH-<rand>`) so visible-text assertions never collide with manually
-- seeded data or earlier test runs.

CREATE TABLE IF NOT EXISTS _e2e_dashboard_fixtures (
  key        text PRIMARY KEY,
  num_value  bigint,
  text_value text
);

-- Drop activity entries from prior runs first (they have FK to workflow_runs
-- via workflow_run_id ON DELETE CASCADE, but explicit cleanup keeps the
-- ordering safe even if the cascade behavior changes).
DELETE FROM activity_logs
  WHERE id IN (
    SELECT num_value FROM _e2e_dashboard_fixtures
    WHERE key LIKE 'seeded_activity_%' AND num_value IS NOT NULL
  );

DELETE FROM operational_requests
  WHERE id IN (
    SELECT request_id FROM workflow_runs
    WHERE id IN (
      SELECT num_value FROM _e2e_dashboard_fixtures
      WHERE key LIKE 'seeded_workflow_%' AND num_value IS NOT NULL
    )
  );

DELETE FROM workflow_runs
  WHERE id IN (
    SELECT num_value FROM _e2e_dashboard_fixtures
    WHERE key LIKE 'seeded_workflow_%' AND num_value IS NOT NULL
  );

DELETE FROM _e2e_dashboard_fixtures;

DO $$
DECLARE
  v_company_id   int;
  v_ops_id       int;
  v_request_id   int;
  v_wf1_id       int;
  v_wf2_id       int;
  v_wf3_id       int;
  v_act1_id      int;
  v_act2_id      int;
  v_act3_id      int;

  v_prefix       text := 'E2E-DASH-' || substr(md5(random()::text), 1, 8);
  v_title1       text;
  v_title2       text;
  v_title3       text;
  v_msg1         text;
  v_msg2         text;
  v_msg3         text;

  v_baseline_active   bigint;
  v_baseline_pending  bigint;
  v_baseline_today    bigint;
  v_baseline_risks    bigint;
  v_baseline_cost     bigint;
BEGIN
  SELECT id INTO v_company_id FROM portfolio_companies WHERE slug = 'acme-industrial' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing: portfolio_companies.slug=acme-industrial. Run `pnpm --filter @workspace/api-server run seed` first.';
  END IF;

  SELECT id INTO v_ops_id FROM agents WHERE slug = 'ops-conductor';
  IF v_ops_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing: agents.slug=ops-conductor. Run `pnpm --filter @workspace/api-server run seed` first.';
  END IF;

  ----------------------------------------------------------------------
  -- Capture baseline metric inputs BEFORE inserting fixture rows.
  -- These mirror the SQL the dashboard route (artifacts/api-server/src/
  -- routes/dashboard.ts) runs to compute the metric tile values.
  ----------------------------------------------------------------------
  SELECT count(*) INTO v_baseline_active
    FROM workflow_runs
    WHERE status IN (
      'submitted','triaged','legal_review','finance_review',
      'communications_draft','approval_pending'
    );

  SELECT count(*) INTO v_baseline_pending
    FROM approval_requests WHERE status = 'pending';

  SELECT count(*) INTO v_baseline_today
    FROM agent_steps WHERE created_at >= date_trunc('day', NOW());

  SELECT count(*) INTO v_baseline_risks
    FROM workflow_runs
    WHERE risk_level <> 'low' AND status <> 'finalized';

  SELECT COALESCE(sum(estimated_cost_cents), 0) INTO v_baseline_cost
    FROM workflow_runs
    WHERE status NOT IN ('rejected','failed');

  INSERT INTO _e2e_dashboard_fixtures (key, num_value) VALUES
    ('baseline_active_workflows',   v_baseline_active),
    ('baseline_pending_approvals',  v_baseline_pending),
    ('baseline_agent_actions_today',v_baseline_today),
    ('baseline_compliance_risks',   v_baseline_risks),
    ('baseline_cost_impact_cents',  v_baseline_cost);

  ----------------------------------------------------------------------
  -- WF1: approval_pending, high risk, $3,000 cost
  ----------------------------------------------------------------------
  v_title1 := v_prefix || ' approval-pending high risk';
  v_msg1   := v_prefix || ' opened approval gate';

  INSERT INTO operational_requests
    (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title1,
          'E2E dashboard fixture: approval-pending high-risk workflow.',
          'Operations', 'high', 'e2e-dashboard')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at)
  VALUES (v_request_id, 'approval_pending', 'approval_pending', 'high', 300000,
          NOW() - INTERVAL '5 minutes')
  RETURNING id INTO v_wf1_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output,
     started_at, completed_at, created_at)
  VALUES (v_wf1_id, v_ops_id, 0, 'Triage & Routing', 'completed',
          '{"summary":"E2E dashboard WF1 triage."}'::jsonb,
          NOW() - INTERVAL '4 minutes', NOW() - INTERVAL '3 minutes', NOW());

  INSERT INTO approval_requests
    (workflow_run_id, status, risk_level, summary, recommendation)
  VALUES (v_wf1_id, 'pending', 'high',
          'E2E dashboard pending approval summary',
          'Approve with conditions');

  INSERT INTO activity_logs
    (workflow_run_id, actor, actor_type, action, message)
  VALUES (v_wf1_id, 'e2e-dashboard', 'system', 'created', v_msg1)
  RETURNING id INTO v_act1_id;

  ----------------------------------------------------------------------
  -- WF2: triaged (active), low risk, $1,500 cost
  ----------------------------------------------------------------------
  v_title2 := v_prefix || ' triaged in-flight';
  v_msg2   := v_prefix || ' moved to memory_retrieval';

  INSERT INTO operational_requests
    (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title2,
          'E2E dashboard fixture: in-flight triaged workflow.',
          'Operations', 'medium', 'e2e-dashboard')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at)
  VALUES (v_request_id, 'triaged', 'memory_retrieval', 'low', 150000,
          NOW() - INTERVAL '2 minutes')
  RETURNING id INTO v_wf2_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output,
     started_at, completed_at, created_at)
  VALUES (v_wf2_id, v_ops_id, 0, 'Triage & Routing', 'completed',
          '{"summary":"E2E dashboard WF2 triage."}'::jsonb,
          NOW() - INTERVAL '90 seconds', NOW() - INTERVAL '60 seconds', NOW());

  INSERT INTO activity_logs
    (workflow_run_id, actor, actor_type, action, message)
  VALUES (v_wf2_id, 'e2e-dashboard', 'system', 'triaged', v_msg2)
  RETURNING id INTO v_act2_id;

  ----------------------------------------------------------------------
  -- WF3: finalized, low risk, $5,000 cost
  ----------------------------------------------------------------------
  v_title3 := v_prefix || ' finalized clean';
  v_msg3   := v_prefix || ' workflow finalized';

  INSERT INTO operational_requests
    (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title3,
          'E2E dashboard fixture: finalized workflow.',
          'Operations', 'low', 'e2e-dashboard')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents,
     started_at, completed_at, summary, final_recommendation, next_actions)
  VALUES (v_request_id, 'finalized', 'finalized', 'low', 500000,
          NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '1 minute',
          'E2E dashboard finalized brief.', 'Approved.', '["Done"]'::jsonb)
  RETURNING id INTO v_wf3_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output,
     started_at, completed_at, created_at)
  VALUES (v_wf3_id, v_ops_id, 0, 'Finalize Workflow', 'completed',
          '{"summary":"E2E dashboard WF3 finalize."}'::jsonb,
          NOW() - INTERVAL '90 seconds', NOW() - INTERVAL '60 seconds', NOW());

  INSERT INTO activity_logs
    (workflow_run_id, actor, actor_type, action, message)
  VALUES (v_wf3_id, 'e2e-dashboard', 'system', 'finalized', v_msg3)
  RETURNING id INTO v_act3_id;

  INSERT INTO _e2e_dashboard_fixtures (key, num_value, text_value) VALUES
    ('seeded_workflow_1', v_wf1_id, v_title1),
    ('seeded_workflow_2', v_wf2_id, v_title2),
    ('seeded_workflow_3', v_wf3_id, v_title3),
    ('seeded_activity_1', v_act1_id, v_msg1),
    ('seeded_activity_2', v_act2_id, v_msg2),
    ('seeded_activity_3', v_act3_id, v_msg3),
    ('prefix',            NULL,      v_prefix);
END $$;

SELECT key, num_value, text_value FROM _e2e_dashboard_fixtures ORDER BY key;
