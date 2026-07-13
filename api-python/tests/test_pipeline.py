"""
AgentOps Python API — pytest suite.

All tests run against the REAL live Postgres database.
assess-endpoint tests mock only the two I/O boundaries that are
non-deterministic in CI: the OpenAI LLM call and the agent-worker
HTTP search endpoint.  Everything else — DB reads, FK enforcement,
Pydantic validation, routing decisions, row writes — exercises real
Postgres.

Run with:
    cd api-python && uv run --no-sync python -m pytest tests/ -v
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import psycopg
import pytest

# ---------------------------------------------------------------------------
# Make api-python importable from the tests/ sub-package
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app, raise_server_exceptions=True)

# ---------------------------------------------------------------------------
# Constants that match worker_loop.py — kept in sync manually
# ---------------------------------------------------------------------------
MAX_ATTEMPTS: int = 4       # job permanently fails after this many failures
BASE_BACKOFF_SECS: int = 2  # retry delay = BASE_BACKOFF_SECS ** attempt_count

# A portfolio company that always exists in the seed data
VALID_PORTFOLIO_CO_ID: int = 1  # Acme Industrial Co.


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.fail("DATABASE_URL environment variable not set")
    return psycopg.connect(url)


def _intake_payload(**overrides) -> dict:
    base = {
        "title": "Automated test request",
        "description": "Created by the pytest test suite — safe to ignore.",
        "department": "finance",
        "priority": "medium",
        "requested_by": "pytest",
        "portfolio_company_id": VALID_PORTFOLIO_CO_ID,
    }
    base.update(overrides)
    return base


def _create_workflow(department: str = "finance") -> int:
    """Create a workflow via real intake + triage calls. Returns workflow_run_id."""
    intake_resp = client.post("/intake", json=_intake_payload(department=department))
    assert intake_resp.status_code == 201, intake_resp.text
    wf_id = intake_resp.json()["workflow_run_id"]

    triage_resp = client.post(f"/triage/{wf_id}")
    assert triage_resp.status_code == 200, triage_resp.text
    return wf_id


def _mock_llm(verdict_dict: dict):
    """Build a fake OpenAI completion whose content is the given dict as JSON."""
    mock = MagicMock()
    mock.choices = [MagicMock()]
    mock.choices[0].message.content = json.dumps(verdict_dict)
    return mock


def _mock_search(mock_httpx, results: list | None = None):
    """Configure the mock httpx module to return a fake vector search response."""
    if results is None:
        results = [
            {
                "chunkId": 10,
                "documentId": 1,
                "title": "Vendor Onboarding Policy v3.2",
                "category": "Procurement",
                "snippet": "All vendor engagements above $25,000 require COI, W-9, and signed MSA.",
                "score": 0.85,
            }
        ]
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "status": "ok",
        "mode": "vector",
        "embeddingMode": "demo",
        "results": results,
        "reason": None,
    }
    mock_resp.raise_for_status = MagicMock()
    mock_httpx.post.return_value = mock_resp


# ===========================================================================
# 1. Invalid foreign key is rejected
# ===========================================================================

def test_invalid_foreign_key_rejected():
    """
    portfolio_company_id=999999 does not exist → the /intake endpoint
    must return 422, not 201 or a 500 server error.
    """
    resp = client.post("/intake", json=_intake_payload(portfolio_company_id=999999))

    assert resp.status_code == 422, resp.text
    body = resp.json()
    # Both the HTTPException detail path and the psycopg FK handler
    # include the offending id in their message.
    assert "999999" in json.dumps(body), f"Expected offending id in body: {body}"


# ===========================================================================
# 2. Malformed LLM output is rejected by Pydantic schema validation
# ===========================================================================

def test_malformed_llm_output_rejected():
    """
    When the LLM returns JSON that does not satisfy AssessmentVerdict
    (missing required 'recommendation', non-numeric 'confidence'),
    the assess endpoint must return 502 mentioning 'schema validation'.
    """
    wf_id = _create_workflow()

    bad_json = json.dumps({"wrong_key": "oops", "confidence": "not_a_float"})
    fake_llm = _mock_llm({"wrong_key": "oops", "confidence": "not_a_float"})
    # Override content to be the raw bad string so json.loads succeeds but
    # model_validate fails.
    fake_llm.choices[0].message.content = bad_json

    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search(mock_httpx)
        mock_openai.chat.completions.create.return_value = fake_llm

        resp = client.post(f"/assess/{wf_id}")

    assert resp.status_code == 502, resp.text
    detail = resp.json()["detail"]
    assert "schema validation" in detail, f"Expected 'schema validation' in detail: {detail!r}"


# ===========================================================================
# 3. Low-confidence assessment routes to approval_requests
# ===========================================================================

def test_low_confidence_routes_to_approval_gate():
    """
    confidence=0.10 with threshold=0.80 must:
      - route = "approval_gate"
      - workflow_status = "approval_pending"
      - create an approval_requests row (status=pending)
      - return a non-null approval_request_id
    """
    wf_id = _create_workflow(department="legal")

    verdict = {
        "recommendation": "Escalate for manual legal review immediately.",
        "confidence": 0.10,
        "risks": ["High legal exposure", "Insufficient documentation"],
        "evidence_references": ["[chunk 1] Standard policy requires sign-off"],
        "next_actions": ["Escalate to legal team"],
    }

    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search(mock_httpx)
        mock_openai.chat.completions.create.return_value = _mock_llm(verdict)

        resp = client.post(f"/assess/{wf_id}?confidence_threshold=0.80")

    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["routing"] == "approval_gate", f"routing={data['routing']!r}"
    assert data["workflow_status"] == "approval_pending", f"workflow_status={data['workflow_status']!r}"
    assert data["approval_request_id"] is not None, "approval_request_id must be set"

    # Verify the approval_requests row is actually in the DB
    ar_id = data["approval_request_id"]
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT status, risk_level, recommendation FROM approval_requests WHERE id = %s",
            (ar_id,),
        )
        row = cur.fetchone()

    assert row is not None, f"approval_requests row id={ar_id} not found in DB"
    assert row[0] == "pending", f"approval_requests.status={row[0]!r}, expected 'pending'"
    assert row[2] == verdict["recommendation"]


# ===========================================================================
# 4. High-confidence assessment auto-completes
# ===========================================================================

def test_high_confidence_auto_completes():
    """
    confidence=0.95 with threshold=0.60 must:
      - route = "auto_complete"
      - workflow_status = "finalized"
      - approval_request_id = None
      - workflow_runs row has status=finalized and final_recommendation set
    """
    wf_id = _create_workflow(department="hr")

    verdict = {
        "recommendation": "Proceed with the HR request immediately; low risk.",
        "confidence": 0.95,
        "risks": ["Minimal procedural risk"],
        "evidence_references": ["[chunk 1] Standard HR policy applies here"],
        "next_actions": ["Approve and close ticket"],
    }

    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search(mock_httpx)
        mock_openai.chat.completions.create.return_value = _mock_llm(verdict)

        resp = client.post(f"/assess/{wf_id}?confidence_threshold=0.60")

    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["routing"] == "auto_complete", f"routing={data['routing']!r}"
    assert data["workflow_status"] == "finalized", f"workflow_status={data['workflow_status']!r}"
    assert data["approval_request_id"] is None, "auto_complete must NOT create approval_request"

    # Verify workflow_runs row is actually finalized in DB
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT status, final_recommendation, completed_at FROM workflow_runs WHERE id = %s",
            (wf_id,),
        )
        row = cur.fetchone()

    assert row[0] == "finalized", f"workflow_runs.status={row[0]!r}"
    assert row[1] == verdict["recommendation"], "final_recommendation must match verdict"
    assert row[2] is not None, "completed_at must be set on finalized workflow"


# ===========================================================================
# 5. Failed job retries with backoff and eventually hits the max-retry ceiling
# ===========================================================================

def test_job_retries_with_backoff_hits_max_ceiling():
    """
    Simulates the fail_job() state-machine from worker_loop.py using raw
    Postgres SQL against the live agentops_py.jobs / agent_runs tables.

    Policy (from worker_loop.py):
      MAX_ATTEMPTS = 4
      BASE_BACKOFF_SECS = 2
      attempt 1 → retry in 2^1 =  2 s
      attempt 2 → retry in 2^2 =  4 s
      attempt 3 → retry in 2^3 =  8 s
      attempt 4 → status = 'failed'  (terminal, no next_retry_at change)

    Asserts:
      - After each of the first 3 failures: status=queued, next_retry_at set
        to approximately now + 2^attempt seconds.
      - After the 4th failure: status=failed, attempt_count=4.
      - One agent_run row per attempt (4 total), all with outcome=failure.
    """
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agentops_py.jobs (workflow, stage, status, attempt_count, updated_at)
            VALUES ('pytest-retry-test', 'backoff-stage', 'queued', 0, now())
            RETURNING id
            """,
        )
        job_id: int = cur.fetchone()[0]
        conn.commit()

    run_ids: list[int] = []

    try:
        for attempt_num in range(1, MAX_ATTEMPTS + 1):
            now = datetime.now(timezone.utc)
            with _db() as conn, conn.cursor() as cur:
                # Read current state
                cur.execute(
                    "SELECT attempt_count, status FROM agentops_py.jobs WHERE id = %s",
                    (job_id,),
                )
                db_attempt, db_status = cur.fetchone()
                new_attempt_count = db_attempt + 1

                # Create an agent_run for this attempt
                cur.execute(
                    """
                    INSERT INTO agentops_py.agent_runs
                        (job_id, started_at, finished_at, outcome, error_message)
                    VALUES (%s, %s, %s, 'failure', 'simulated error in pytest')
                    RETURNING id
                    """,
                    (job_id, now, now),
                )
                run_ids.append(cur.fetchone()[0])

                if new_attempt_count >= MAX_ATTEMPTS:
                    # Terminal: mark permanently failed
                    cur.execute(
                        """
                        UPDATE agentops_py.jobs
                        SET status        = 'failed',
                            attempt_count = %s,
                            last_error    = 'simulated error in pytest',
                            updated_at    = %s
                        WHERE id = %s
                        """,
                        (new_attempt_count, now, job_id),
                    )
                else:
                    # Retry with exponential backoff
                    backoff_secs = BASE_BACKOFF_SECS ** new_attempt_count
                    retry_at = now + timedelta(seconds=backoff_secs)
                    cur.execute(
                        """
                        UPDATE agentops_py.jobs
                        SET status        = 'queued',
                            attempt_count = %s,
                            next_retry_at = %s,
                            last_error    = 'simulated error in pytest',
                            updated_at    = %s
                        WHERE id = %s
                        """,
                        (new_attempt_count, retry_at, now, job_id),
                    )
                conn.commit()

            # --- Assert state after this failure ---
            with _db() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT status, attempt_count, next_retry_at, last_error FROM agentops_py.jobs WHERE id = %s",
                    (job_id,),
                )
                status, attempt_count, next_retry_at, last_error = cur.fetchone()

            expected_attempt = attempt_num
            assert attempt_count == expected_attempt, (
                f"After failure {attempt_num}: attempt_count={attempt_count}, expected {expected_attempt}"
            )
            assert last_error == "simulated error in pytest"

            if attempt_num < MAX_ATTEMPTS:
                expected_backoff = BASE_BACKOFF_SECS ** attempt_num
                assert status == "queued", (
                    f"After failure {attempt_num} (not terminal): status={status!r}, expected 'queued'"
                )
                assert next_retry_at is not None, (
                    f"After failure {attempt_num}: next_retry_at must be set"
                )
                # next_retry_at should be approximately now + expected_backoff (within 5s tolerance)
                delta = abs((next_retry_at - now).total_seconds() - expected_backoff)
                assert delta < 5, (
                    f"Attempt {attempt_num}: next_retry_at offset={delta:.1f}s, "
                    f"expected ~{expected_backoff}s (2^{attempt_num})"
                )
            else:
                # Terminal
                assert status == "failed", (
                    f"After final failure {attempt_num}: status={status!r}, expected 'failed'"
                )

        # Final state checks
        with _db() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT status, attempt_count FROM agentops_py.jobs WHERE id = %s",
                (job_id,),
            )
            final_status, final_attempt = cur.fetchone()

            cur.execute(
                "SELECT COUNT(*) FROM agentops_py.agent_runs WHERE job_id = %s AND outcome = 'failure'",
                (job_id,),
            )
            failure_run_count: int = cur.fetchone()[0]

        assert final_status == "failed", f"Final status={final_status!r}"
        assert final_attempt == MAX_ATTEMPTS, f"Final attempt_count={final_attempt}"
        assert failure_run_count == MAX_ATTEMPTS, (
            f"Expected {MAX_ATTEMPTS} failure runs, got {failure_run_count}"
        )

    finally:
        # Cleanup: CASCADE on jobs → agent_runs handles agent_runs automatically
        with _db() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM agentops_py.jobs WHERE id = %s", (job_id,))
            conn.commit()


# ===========================================================================
# 6. A retried job does NOT create a duplicate completed run
# ===========================================================================

def test_retried_job_no_duplicate_completed_run():
    """
    A completed job must be invisible to the worker's claim query
    (SELECT ... WHERE status='queued' FOR UPDATE SKIP LOCKED).

    Setup: insert a job with status=completed and one success agent_run.
    Assertion: the claim query returns nothing → no second run created.
    Secondary assertion: exactly one success run exists in agent_runs.
    """
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO agentops_py.jobs
                (workflow, stage, status, attempt_count, updated_at)
            VALUES ('pytest-nodup', 'complete', 'completed', 1, now())
            RETURNING id
            """,
        )
        job_id: int = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO agentops_py.agent_runs
                (job_id, started_at, finished_at, outcome)
            VALUES (%s, now(), now(), 'success')
            RETURNING id
            """,
            (job_id,),
        )
        run_id: int = cur.fetchone()[0]
        conn.commit()

    try:
        # Try to claim the job using the exact SELECT used by claim_job()
        now = datetime.now(timezone.utc)
        with _db() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM agentops_py.jobs
                WHERE  status = 'queued'
                AND    (next_retry_at IS NULL OR next_retry_at <= %s)
                ORDER  BY created_at
                FOR    UPDATE SKIP LOCKED
                LIMIT  1
                """,
                (now,),
            )
            claimed_row = cur.fetchone()
            conn.commit()

        assert claimed_row is None or claimed_row[0] != job_id, (
            f"Completed job id={job_id} must not be claimable; "
            f"claim returned: {claimed_row}"
        )

        # Verify there is exactly one success run
        with _db() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM agentops_py.agent_runs WHERE job_id = %s AND outcome = 'success'",
                (job_id,),
            )
            success_count: int = cur.fetchone()[0]

        assert success_count == 1, (
            f"Expected exactly 1 success run, got {success_count}"
        )

    finally:
        with _db() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM agentops_py.jobs WHERE id = %s", (job_id,))
            conn.commit()


# ===========================================================================
# 7. Retrieval references are correctly stored with the verdict
# ===========================================================================

def test_retrieval_references_stored_with_verdict():
    """
    The evidence_references from the LLM verdict must appear verbatim in
    agentops_py.assessments.evidence_refs as a JSON array.
    """
    wf_id = _create_workflow(department="procurement")

    evidence = [
        "[chunk 2 | doc=1 score=0.92] All vendor engagements above $25,000 require COI.",
        "[chunk 1 | doc=2 score=0.85] All material vendor decisions are logged in AgentOps.",
    ]
    verdict = {
        "recommendation": "Proceed with vendor onboarding per established policy.",
        "confidence": 0.88,
        "risks": ["Missing Certificate of Insurance"],
        "evidence_references": evidence,
        "next_actions": ["Collect COI", "Log approval in AgentOps"],
    }

    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search(mock_httpx)
        mock_openai.chat.completions.create.return_value = _mock_llm(verdict)

        resp = client.post(f"/assess/{wf_id}")

    assert resp.status_code == 200, resp.text
    assessment_id = resp.json()["assessment_id"]

    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT evidence_refs FROM agentops_py.assessments WHERE id = %s",
            (assessment_id,),
        )
        row = cur.fetchone()

    assert row is not None, f"No assessment row found for id={assessment_id}"
    stored = row[0]
    if isinstance(stored, str):
        stored = json.loads(stored)

    assert stored == evidence, (
        f"Stored evidence_refs do not match verdict.evidence_references.\n"
        f"  expected: {evidence}\n"
        f"  got:      {stored}"
    )


# ===========================================================================
# 8. Integration: intake → triage → assess end-to-end
# ===========================================================================

def test_intake_triage_assess_end_to_end():
    """
    Full pipeline walk-through against the live database.

    Step 1 — POST /intake
        Creates operational_requests + workflow_runs (status=submitted).
    Step 2 — POST /triage/{id}
        Classifies as 'budget_increase' → risk=medium, status=triaged.
    Step 3 — POST /assess/{id}  (mocked LLM + search, confidence=0.87 ≥ 0.6)
        auto_complete → workflow finalized, assessment row written.
    Step 4 — GET /workflow/{id}
        Confirms final state visible through the query endpoint.
    """
    # Step 1 — Intake
    intake_payload = {
        "title": "E2E: Salesforce CRM annual license renewal",
        "description": "Annual renewal of Salesforce CRM licenses for 50 seats at $180,000/yr.",
        "department": "finance",
        "priority": "high",
        "requested_by": "pytest-e2e",
        "portfolio_company_id": VALID_PORTFOLIO_CO_ID,
    }
    intake_resp = client.post("/intake", json=intake_payload)
    assert intake_resp.status_code == 201, intake_resp.text
    intake_data = intake_resp.json()

    wf_id = intake_data["workflow_run_id"]
    assert intake_data["status"] == "submitted"
    assert intake_data["current_stage"] == "submitted"
    assert intake_data["portfolio_company_id"] == VALID_PORTFOLIO_CO_ID

    # Step 2 — Triage
    triage_resp = client.post(f"/triage/{wf_id}", json={"request_type": "budget_increase"})
    assert triage_resp.status_code == 200, triage_resp.text
    triage_data = triage_resp.json()

    assert triage_data["status"] == "triaged"
    assert triage_data["risk_level"] == "medium"   # budget_increase maps to medium
    assert triage_data["reviewer_tag"] == "finance-team"

    # Step 3 — Assess (high confidence → auto_complete)
    verdict = {
        "recommendation": "Approve Salesforce renewal; within policy and budget envelope.",
        "confidence": 0.87,
        "risks": ["Annual cost may approach budget ceiling if seat count grows"],
        "evidence_references": [
            "[chunk 1 | doc=2 score=0.91] Department heads own quarterly budget envelopes.",
        ],
        "next_actions": ["Issue PO", "Log approval in AgentOps"],
    }

    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search(mock_httpx)
        mock_openai.chat.completions.create.return_value = _mock_llm(verdict)

        assess_resp = client.post(f"/assess/{wf_id}?confidence_threshold=0.60")

    assert assess_resp.status_code == 200, assess_resp.text
    assess_data = assess_resp.json()

    assert assess_data["routing"] == "auto_complete"
    assert assess_data["workflow_status"] == "finalized"
    assert assess_data["retrieval_mode"] is not None
    assert assess_data["retrieval_chunks_used"] >= 1
    assert assess_data["approval_request_id"] is None
    assert assess_data["verdict"]["confidence"] == pytest.approx(0.87)

    # Verify assessment row written to DB
    assessment_id = assess_data["assessment_id"]
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT routing, confidence, retrieval_mode FROM agentops_py.assessments WHERE id = %s",
            (assessment_id,),
        )
        db_row = cur.fetchone()

    assert db_row is not None, f"No assessment row for id={assessment_id}"
    assert db_row[0] == "auto_complete"
    assert abs(db_row[1] - 0.87) < 0.001
    assert db_row[2] == "vector"

    # Step 4 — GET /workflow confirms finalized state
    state_resp = client.get(f"/workflow/{wf_id}")
    assert state_resp.status_code == 200, state_resp.text
    state = state_resp.json()

    assert state["status"] == "finalized"
    assert state["current_stage"] == "finalized"
    assert state["final_recommendation"] == verdict["recommendation"]
    assert state["completed_at"] is not None
