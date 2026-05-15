-- E2E fixture seeder for the Workflow Run Detail page (artifacts/agentops/src/pages/workflow-detail.tsx).
--
-- Creates one workflow per UI state that the page must render:
--   submitted, running, approval_pending, finalized, failed
--
-- Writes the resulting workflow ids (and the approval id, when applicable) to a
-- regular table named `_e2e_workflow_fixtures` so the test plan can read them
-- back via a single SELECT after the seed runs.
--
-- This script is idempotent: it deletes any prior fixtures and unique-suffixes
-- request titles with a per-run prefix so it never conflicts with manually
-- seeded data or earlier test runs.

CREATE TABLE IF NOT EXISTS _e2e_workflow_fixtures (
  state          text PRIMARY KEY,
  workflow_id    int  NOT NULL,
  approval_id    int,
  request_title  text NOT NULL
);

-- Drop any rows from prior runs and the workflows + requests they reference.
-- Order matters: capture the request ids BEFORE deleting the workflow rows,
-- otherwise the request-cleanup subquery would join against rows that were
-- just removed and silently leave orphan operational_requests behind.
DELETE FROM operational_requests
  WHERE id IN (
    SELECT request_id FROM workflow_runs
    WHERE id IN (SELECT workflow_id FROM _e2e_workflow_fixtures)
  );
DELETE FROM workflow_runs WHERE id IN (SELECT workflow_id FROM _e2e_workflow_fixtures);
DELETE FROM _e2e_workflow_fixtures;

DO $$
DECLARE
  v_company_id   int;
  v_ops_id       int;
  v_legal_id     int;
  v_finance_id   int;
  v_comms_id     int;
  v_memory_id    int;

  v_request_id   int;
  v_wf_id        int;
  v_step_id      int;
  v_approval_id  int;

  v_prefix       text := 'E2E-' || substr(md5(random()::text), 1, 8);
  v_title        text;
BEGIN
  SELECT id INTO v_company_id FROM portfolio_companies WHERE slug = 'acme-industrial' LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing: portfolio_companies.slug=acme-industrial. Run `pnpm --filter @workspace/api-server run seed` first.';
  END IF;

  SELECT id INTO v_ops_id     FROM agents WHERE slug = 'ops-conductor';
  SELECT id INTO v_legal_id   FROM agents WHERE slug = 'legal-counsel';
  SELECT id INTO v_finance_id FROM agents WHERE slug = 'finance-analyst';
  SELECT id INTO v_comms_id   FROM agents WHERE slug = 'communications';
  SELECT id INTO v_memory_id  FROM agents WHERE slug = 'memory-keeper';
  IF v_ops_id IS NULL OR v_legal_id IS NULL OR v_finance_id IS NULL
     OR v_comms_id IS NULL OR v_memory_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing: required agent slugs. Run `pnpm --filter @workspace/api-server run seed` first.';
  END IF;

  ----------------------------------------------------------------------
  -- 1) submitted: brand-new workflow, no agent steps yet
  ----------------------------------------------------------------------
  v_title := v_prefix || ' submitted';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E submitted fixture: nothing has run yet.', 'Operations', 'medium', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs (request_id, status, current_stage, risk_level, estimated_cost_cents)
  VALUES (v_request_id, 'submitted', 'submitted', 'low', 500000)
  RETURNING id INTO v_wf_id;

  INSERT INTO _e2e_workflow_fixtures (state, workflow_id, request_title) VALUES ('submitted', v_wf_id, v_title);

  ----------------------------------------------------------------------
  -- 2) running: triage completed, memory step currently running
  ----------------------------------------------------------------------
  v_title := v_prefix || ' running';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E running fixture: pipeline mid-flight.', 'Operations', 'high', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at)
  VALUES (v_request_id, 'triaged', 'memory_retrieval', 'medium', 800000, NOW() - INTERVAL '30 seconds')
  RETURNING id INTO v_wf_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 0, 'Triage & Routing', 'completed',
          '{"summary":"Routed to legal+finance.","findings":["High urgency"],"risks":[],"recommendedActions":[]}'::jsonb,
          NOW() - INTERVAL '30 seconds', NOW() - INTERVAL '20 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, started_at)
  VALUES (v_wf_id, v_memory_id, 1, 'Knowledge Grounding', 'running',
          NOW() - INTERVAL '5 seconds');

  INSERT INTO _e2e_workflow_fixtures (state, workflow_id, request_title) VALUES ('running', v_wf_id, v_title);

  ----------------------------------------------------------------------
  -- 3) approval_pending: all upstream steps complete, memory hits seeded
  --    via a memory_search tool call, approval awaiting decision
  ----------------------------------------------------------------------
  v_title := v_prefix || ' approval-pending';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E approval-pending fixture: gate is open.', 'Operations', 'high', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at)
  VALUES (v_request_id, 'approval_pending', 'approval_pending', 'medium', 4800000,
          NOW() - INTERVAL '2 minutes')
  RETURNING id INTO v_wf_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 0, 'Triage & Routing', 'completed',
          '{"summary":"Routed.","findings":[],"risks":[],"recommendedActions":[]}'::jsonb,
          NOW() - INTERVAL '120 seconds', NOW() - INTERVAL '110 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_memory_id, 1, 'Knowledge Grounding', 'completed',
          '{"summary":"Found 1 doc.","findings":[],"risks":[],"recommendedActions":[]}'::jsonb,
          NOW() - INTERVAL '110 seconds', NOW() - INTERVAL '100 seconds')
  RETURNING id INTO v_step_id;

  INSERT INTO tool_calls
    (workflow_run_id, agent_step_id, tool_name, status, input, output, output_summary, duration_ms)
  VALUES (v_wf_id, v_step_id, 'memory_search', 'success',
          '{"query":"roofing vendor"}'::jsonb,
          '{"hits":[{"documentId":99901,"title":"E2E Roofing Policy","category":"policy","snippet":"Test snippet about roofing vendor approvals.","score":0.92}]}'::jsonb,
          'Found 1 hit', 23);

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_legal_id, 2, 'Legal & Compliance Review', 'completed',
          '{"summary":"Vendor warranty acceptable.","findings":["Warranty: 10 years"],"risks":["Liability cap missing"],"recommendedActions":["Add liability cap"]}'::jsonb,
          NOW() - INTERVAL '100 seconds', NOW() - INTERVAL '80 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_finance_id, 3, 'Finance & Budget Review', 'completed',
          '{"summary":"Within budget.","findings":["Cost $48k"],"risks":[],"recommendedActions":[]}'::jsonb,
          NOW() - INTERVAL '80 seconds', NOW() - INTERVAL '60 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_comms_id, 4, 'Communications Draft', 'completed',
          '{"summary":"Internal memo drafted.","findings":[],"risks":[],"recommendedActions":[]}'::jsonb,
          NOW() - INTERVAL '60 seconds', NOW() - INTERVAL '40 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 5, 'Open Approval Gate', 'completed',
          '{"summary":"Approval requested."}'::jsonb,
          NOW() - INTERVAL '40 seconds', NOW() - INTERVAL '30 seconds');

  INSERT INTO approval_requests (workflow_run_id, status, risk_level, summary, recommendation)
  VALUES (v_wf_id, 'pending', 'medium',
          'E2E approval summary text.',
          'E2E approve recommendation text.')
  RETURNING id INTO v_approval_id;

  INSERT INTO _e2e_workflow_fixtures (state, workflow_id, approval_id, request_title)
  VALUES ('approval_pending', v_wf_id, v_approval_id, v_title);

  ----------------------------------------------------------------------
  -- 4) finalized: synthesis step present so Final Executive Brief renders
  ----------------------------------------------------------------------
  v_title := v_prefix || ' finalized';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E finalized fixture: brief should render.', 'Operations', 'medium', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs
    (request_id, status, current_stage, risk_level, estimated_cost_cents,
     summary, final_recommendation, next_actions, started_at, completed_at)
  VALUES (v_request_id, 'finalized', 'finalized', 'low', 4800000,
          'E2E executive summary text.',
          'Approve vendor with conditions',
          '["Notify vendor","Schedule kickoff"]'::jsonb,
          NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '1 minute')
  RETURNING id INTO v_wf_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 0, 'Triage & Routing', 'completed',
          '{"summary":"Triage complete."}'::jsonb,
          NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '4 minutes');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 1, 'Risk Synthesis', 'completed',
          '{"summary":"Synthesis summary.","findings":["E1","E2"],"risks":[],"recommendedActions":["A1"],"details":{"recommendedDecision":"Approve vendor with conditions","keyEvidence":["E2E key evidence 1","E2E key evidence 2"]}}'::jsonb,
          NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '90 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 2, 'Finalize Workflow', 'completed',
          '{"summary":"Workflow closed."}'::jsonb,
          NOW() - INTERVAL '90 seconds', NOW() - INTERVAL '60 seconds');

  INSERT INTO _e2e_workflow_fixtures (state, workflow_id, request_title) VALUES ('finalized', v_wf_id, v_title);

  ----------------------------------------------------------------------
  -- 5) failed: legal step failed, downstream nodes should appear skipped
  ----------------------------------------------------------------------
  v_title := v_prefix || ' failed';
  INSERT INTO operational_requests (portfolio_company_id, title, description, department, priority, requested_by)
  VALUES (v_company_id, v_title, 'E2E failed fixture: legal review failed.', 'Operations', 'urgent', 'e2e-tester')
  RETURNING id INTO v_request_id;

  INSERT INTO workflow_runs (request_id, status, current_stage, risk_level, estimated_cost_cents, started_at, completed_at)
  VALUES (v_request_id, 'failed', 'legal_review', 'high', 100000,
          NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '1 minute')
  RETURNING id INTO v_wf_id;

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_ops_id, 0, 'Triage & Routing', 'completed',
          '{"summary":"Triage OK."}'::jsonb,
          NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '170 seconds');

  INSERT INTO agent_steps
    (workflow_run_id, agent_id, step_index, name, status, output, started_at, completed_at)
  VALUES (v_wf_id, v_legal_id, 1, 'Legal & Compliance Review', 'failed',
          '{"summary":"Vendor blacklisted - failing legal review."}'::jsonb,
          NOW() - INTERVAL '170 seconds', NOW() - INTERVAL '60 seconds');

  INSERT INTO _e2e_workflow_fixtures (state, workflow_id, request_title) VALUES ('failed', v_wf_id, v_title);
END $$;

SELECT state, workflow_id, approval_id, request_title
FROM _e2e_workflow_fixtures
ORDER BY
  CASE state
    WHEN 'submitted' THEN 1
    WHEN 'running' THEN 2
    WHEN 'approval_pending' THEN 3
    WHEN 'finalized' THEN 4
    WHEN 'failed' THEN 5
  END;
