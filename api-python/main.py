"""
AgentOps Python/FastAPI service — standalone, additive only.

Exposes four endpoints that read/write the SAME Postgres database
owned by the existing TypeScript api-server.  No schema changes to
the public schema, no modification of existing TypeScript code.

Endpoints
---------
POST  /api-python/intake
    Validate and persist a new operational request + workflow run.
    Status set to "submitted" (the canonical entry value in the
    workflow_status enum — "intake_received" does not exist in the enum
    and adding it would require altering the existing schema).

POST  /api-python/triage/{workflow_id}
    Classify the request using a department/request_type signal and
    advance the workflow to status "triaged".

POST  /api-python/assess/{workflow_id}
    RAG-backed assessment: retrieve relevant knowledge chunks via the
    agent-worker's vector/keyword search, call an LLM, validate the
    response against AssessmentVerdict, persist to agentops_py.assessments,
    and route low-confidence results into the approval_requests gate.

GET   /api-python/workflow/{workflow_id}
    Return the full current state of a workflow run, including
    associated agent_steps and tool_calls ledger entries.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import openai
import psycopg
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from database import get_conn
from models import (
    CONFIDENCE_THRESHOLD_DEFAULT,
    AgentStepSummary,
    AssessmentResponse,
    AssessmentVerdict,
    IntakeRequest,
    IntakeResponse,
    ToolCallSummary,
    TriageBody,
    TriageResponse,
    WorkflowStateResponse,
)

app = FastAPI(
    title="AgentOps Python API",
    description=(
        "Standalone FastAPI service that reads/writes the shared AgentOps "
        "Postgres database.  Additive only — no existing tables or routes "
        "are modified."
    ),
    version="1.0.0",
    root_path="/api-python",
)

# ---------------------------------------------------------------------------
# OpenAI client — uses Replit AI Integrations proxy when env vars are set,
# falls back to bare openai SDK (requires OPENAI_API_KEY) otherwise.
# ---------------------------------------------------------------------------

def _build_openai_client() -> openai.OpenAI:
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    if base_url and api_key:
        return openai.OpenAI(api_key=api_key, base_url=base_url)
    return openai.OpenAI()


_openai = _build_openai_client()

# ---------------------------------------------------------------------------
# Agent-worker base URL — the search endpoint lives there
# ---------------------------------------------------------------------------

_WORKER_BASE = os.environ.get("WORKER_BASE_URL", "http://localhost:8000")


# ---------------------------------------------------------------------------
# Global error handlers — convert psycopg errors to clean 4xx/5xx responses
# ---------------------------------------------------------------------------

@app.exception_handler(psycopg.errors.ForeignKeyViolation)
async def fk_violation_handler(_req: Request, exc: psycopg.errors.ForeignKeyViolation) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": "foreign_key_violation", "detail": str(exc).split("\n")[0]},
    )


@app.exception_handler(psycopg.errors.UniqueViolation)
async def unique_violation_handler(_req: Request, exc: psycopg.errors.UniqueViolation) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"error": "unique_violation", "detail": str(exc).split("\n")[0]},
    )


@app.exception_handler(psycopg.Error)
async def psycopg_error_handler(_req: Request, exc: psycopg.Error) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "database_error", "detail": str(exc).split("\n")[0]},
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/healthz", tags=["meta"])
def healthz() -> dict[str, str]:
    """Liveness check — also verifies the DB connection is reachable."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1")
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /intake
# ---------------------------------------------------------------------------

@app.post("/intake", response_model=IntakeResponse, status_code=201, tags=["pipeline"])
def intake(body: IntakeRequest) -> IntakeResponse:
    """
    Accept a new operational request and create the workflow run record.

    Writes two rows:
      1. operational_requests  — the request payload
      2. workflow_runs          — status="submitted", current_stage="submitted"

    The portfolio_company_id must reference an existing row in
    portfolio_companies (FK enforced by Postgres).  If it does not exist,
    you will receive a 422 foreign_key_violation error.

    "submitted" is the canonical entry status for a workflow run in this
    system.  The enum does not contain an "intake_received" value, and
    altering the enum would modify the existing schema.
    """
    with get_conn() as conn, conn.cursor() as cur:
        # 1. Verify the portfolio company exists before inserting so we can
        #    return a clear 422 instead of relying solely on FK error text.
        cur.execute(
            "SELECT id FROM portfolio_companies WHERE id = %s",
            (body.portfolio_company_id,),
        )
        if cur.fetchone() is None:
            raise HTTPException(
                status_code=422,
                detail=f"portfolio_company_id {body.portfolio_company_id} does not exist",
            )

        # 2. Insert the operational request.
        cur.execute(
            """
            INSERT INTO operational_requests
                (portfolio_company_id, title, description, department, priority, requested_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (
                body.portfolio_company_id,
                body.title.strip(),
                body.description.strip(),
                body.department.strip(),
                body.priority,
                body.requested_by.strip(),
            ),
        )
        req_row = cur.fetchone()
        if req_row is None:
            raise HTTPException(status_code=500, detail="Failed to insert operational_request")
        operational_request_id: int = req_row[0]
        req_created_at: datetime = req_row[1]

        # 3. Insert the workflow run.
        #    risk_level and estimated_cost_cents get their defaults; the
        #    triage step will update them.
        cur.execute(
            """
            INSERT INTO workflow_runs
                (request_id, status, current_stage, risk_level, estimated_cost_cents)
            VALUES (%s, 'submitted', 'submitted', 'low', 0)
            RETURNING id
            """,
            (operational_request_id,),
        )
        run_row = cur.fetchone()
        if run_row is None:
            raise HTTPException(status_code=500, detail="Failed to insert workflow_run")
        workflow_run_id: int = run_row[0]

        conn.commit()

    return IntakeResponse(
        workflow_run_id=workflow_run_id,
        operational_request_id=operational_request_id,
        status="submitted",
        current_stage="submitted",
        portfolio_company_id=body.portfolio_company_id,
        title=body.title.strip(),
        department=body.department.strip(),
        priority=body.priority,
        requested_by=body.requested_by.strip(),
        created_at=req_created_at,
    )


# ---------------------------------------------------------------------------
# Triage classification rules
# ---------------------------------------------------------------------------

_ROUTING_TABLE: dict[str, dict[str, str]] = {
    "legal": {
        "reviewer_tag": "legal-team",
        "risk_level": "high",
        "rationale": "Legal department requests trigger mandatory legal-team review due to contractual and compliance exposure.",
    },
    "compliance": {
        "reviewer_tag": "compliance-team",
        "risk_level": "high",
        "rationale": "Compliance requests carry regulatory risk and require a dedicated compliance reviewer.",
    },
    "finance": {
        "reviewer_tag": "finance-team",
        "risk_level": "medium",
        "rationale": "Finance requests require budget authority sign-off; medium risk pending spend size.",
    },
    "engineering": {
        "reviewer_tag": "engineering-team",
        "risk_level": "medium",
        "rationale": "Engineering requests may have system-availability implications; medium risk default.",
    },
    "hr": {
        "reviewer_tag": "hr-team",
        "risk_level": "low",
        "rationale": "HR department requests routed to HR team; typically low operational risk.",
    },
    "operations": {
        "reviewer_tag": "ops-team",
        "risk_level": "low",
        "rationale": "Operational requests routed to the operations team for standard review.",
    },
    "marketing": {
        "reviewer_tag": "marketing-team",
        "risk_level": "low",
        "rationale": "Marketing requests are routed to the marketing team; low financial risk.",
    },
    "procurement": {
        "reviewer_tag": "finance-team",
        "risk_level": "medium",
        "rationale": "Procurement requests require finance sign-off for spend approval.",
    },
    "vendor_contract": {
        "reviewer_tag": "legal-team",
        "risk_level": "high",
        "rationale": "Vendor contracts carry legal and financial liability; routed to legal for review.",
    },
    "budget_increase": {
        "reviewer_tag": "finance-team",
        "risk_level": "medium",
        "rationale": "Budget increase requests require finance authority approval.",
    },
    "policy_change": {
        "reviewer_tag": "compliance-team",
        "risk_level": "high",
        "rationale": "Policy changes have broad compliance implications and require compliance-team ownership.",
    },
}

_DEFAULT_ROUTING = {
    "reviewer_tag": "ops-team",
    "risk_level": "low",
    "rationale": "No specific routing rule matched; defaulting to ops-team for general review.",
}


def _classify(signal: str) -> dict[str, str]:
    """Return routing metadata for the given department or request_type signal."""
    key = signal.strip().lower().replace(" ", "_").replace("-", "_")
    return _ROUTING_TABLE.get(key, _DEFAULT_ROUTING)


# ---------------------------------------------------------------------------
# POST /triage/{workflow_id}
# ---------------------------------------------------------------------------

@app.post("/triage/{workflow_id}", response_model=TriageResponse, tags=["pipeline"])
def triage(workflow_id: int, body: TriageBody = TriageBody()) -> TriageResponse:
    """
    Classify the workflow and advance its status to "triaged".

    Classification signal priority:
      1. request_type in the POST body (if provided)
      2. department stored on the operational_request row

    Updates workflow_runs:
      status        → "triaged"
      current_stage → "triaged"
      risk_level    → derived from classification
      started_at    → now (marks pipeline entry)

    Returns the routing decision so the caller can verify the logic.
    """
    with get_conn() as conn, conn.cursor() as cur:
        # Load the workflow run + joined request.
        cur.execute(
            """
            SELECT wr.id, wr.status, wr.current_stage,
                   or2.id AS req_id, or2.department
            FROM workflow_runs wr
            JOIN operational_requests or2 ON or2.id = wr.request_id
            WHERE wr.id = %s
            """,
            (workflow_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"workflow_run {workflow_id} not found",
            )

        current_status: str = row[1]
        department: str = row[4]

        # Guard: only triage workflows that are in a triage-eligible status.
        TRIAGE_ELIGIBLE = {"submitted", "failed"}
        if current_status not in TRIAGE_ELIGIBLE:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"workflow_run {workflow_id} is in status '{current_status}' "
                    f"and cannot be triaged. Expected one of: {sorted(TRIAGE_ELIGIBLE)}"
                ),
            )

        # Determine the classification signal.
        signal = (body.request_type or "").strip() or department
        routing = _classify(signal)

        # Advance the workflow.
        cur.execute(
            """
            UPDATE workflow_runs
            SET status        = 'triaged',
                current_stage = 'triaged',
                risk_level    = %s,
                started_at    = %s
            WHERE id = %s
            """,
            (routing["risk_level"], datetime.now(tz=timezone.utc), workflow_id),
        )
        conn.commit()

    return TriageResponse(
        workflow_run_id=workflow_id,
        status="triaged",
        current_stage="triaged",
        risk_level=routing["risk_level"],
        reviewer_tag=routing["reviewer_tag"],
        routing_rationale=routing["rationale"],
    )


# ---------------------------------------------------------------------------
# POST /assess/{workflow_id}
# ---------------------------------------------------------------------------

_ASSESS_SYSTEM_PROMPT = """\
You are an operational-risk assessor for a private-equity portfolio management platform.
You will receive:
  - A workflow request (title, description, department, priority)
  - Relevant knowledge-base chunks retrieved via vector/keyword search

Your job is to produce a structured JSON assessment object with EXACTLY these fields:
  "recommendation"     : string — a clear, actionable recommendation (1-3 sentences)
  "confidence"         : float  — your confidence in this recommendation, 0.0 to 1.0
                                  Use lower values when evidence is thin, risks are high,
                                  or the request is ambiguous. Use higher values when the
                                  request is straightforward and well-supported by policy.
  "risks"              : array of strings — specific risk factors identified
  "evidence_references": array of strings — exact quotes or chunk identifiers from the
                                  knowledge base that informed your assessment
  "next_actions"       : array of strings — concrete next steps for the operator

Respond with ONLY a valid JSON object matching the schema above. No prose outside the JSON.
"""


def _build_assess_prompt(
    title: str,
    description: str,
    department: str,
    priority: str,
    risk_level: str,
    chunks: list[dict[str, Any]],
) -> str:
    lines: list[str] = [
        "## Workflow Request",
        f"Title       : {title}",
        f"Description : {description}",
        f"Department  : {department}",
        f"Priority    : {priority}",
        f"Risk level  : {risk_level}",
        "",
        "## Retrieved Knowledge-Base Chunks",
    ]
    if chunks:
        for i, c in enumerate(chunks, 1):
            lines.append(
                f"[chunk {i} | doc={c.get('documentId')} score={c.get('score', 0):.3f}]"
                f" {c.get('snippet', '')}"
            )
    else:
        lines.append("(no relevant chunks found — assess based on general policy)")
    lines.append("")
    lines.append("Produce the JSON assessment now.")
    return "\n".join(lines)


@app.post("/assess/{workflow_id}", response_model=AssessmentResponse, tags=["pipeline"])
def assess(
    workflow_id: int,
    confidence_threshold: float = Query(
        default=CONFIDENCE_THRESHOLD_DEFAULT,
        ge=0.0,
        le=1.0,
        description="Confidence below this value routes to human approval gate",
    ),
) -> AssessmentResponse:
    """
    RAG-backed assessment for a workflow run.

    Pipeline
    --------
    1. Load the workflow_run + operational_request from Postgres.
    2. Retrieve relevant knowledge chunks by calling the agent-worker's
       POST /worker/memory/search-spike (reuses the existing retrieval code).
    3. Build a structured prompt and call the LLM (gpt-5.4 via Replit proxy).
    4. Validate the response against AssessmentVerdict (strict Pydantic schema).
    5. Persist the verdict to agentops_py.assessments.
    6. If confidence < confidence_threshold:
         - Write an approval_requests row (status=pending).
         - Advance workflow_runs to approval_pending.
       Else:
         - Advance workflow_runs to finalized with final_recommendation.

    The workflow must be in a non-terminal, non-submitted state (e.g. triaged,
    legal_review, finance_review).  Re-assessment after approval is allowed.
    """
    # ------------------------------------------------------------------
    # 1. Load workflow
    # ------------------------------------------------------------------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT wr.id, wr.status, wr.current_stage, wr.risk_level,
                   or2.title, or2.description, or2.department, or2.priority
            FROM workflow_runs wr
            JOIN operational_requests or2 ON or2.id = wr.request_id
            WHERE wr.id = %s
            """,
            (workflow_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=f"workflow_run {workflow_id} not found")

    _wf_id, wf_status, wf_stage, wf_risk, req_title, req_desc, req_dept, req_priority = row

    TERMINAL = {"approved", "rejected", "finalized"}
    NEEDS_TRIAGE = {"submitted"}
    if wf_status in NEEDS_TRIAGE:
        raise HTTPException(
            status_code=409,
            detail=(
                f"workflow_run {workflow_id} is in status '{wf_status}'. "
                "Run POST /triage/{workflow_id} first."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Retrieve relevant chunks via agent-worker search endpoint
    # ------------------------------------------------------------------
    retrieval_query = f"{req_title}. {req_desc}"
    try:
        search_resp = httpx.post(
            f"{_WORKER_BASE}/worker/memory/search-spike",
            json={"query": retrieval_query, "limit": 6},
            timeout=15.0,
        )
        search_resp.raise_for_status()
        search_data = search_resp.json()
        chunks: list[dict[str, Any]] = search_data.get("results", [])
        retrieval_mode: str = search_data.get("mode", "unknown")
    except Exception as exc:
        # Retrieval failure is non-fatal: assess with empty context
        chunks = []
        retrieval_mode = f"retrieval_failed:{type(exc).__name__}"

    # ------------------------------------------------------------------
    # 3. Call LLM
    # ------------------------------------------------------------------
    user_prompt = _build_assess_prompt(
        title=req_title,
        description=req_desc,
        department=req_dept,
        priority=req_priority,
        risk_level=wf_risk,
        chunks=chunks,
    )

    try:
        completion = _openai.chat.completions.create(
            model="gpt-5.4",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _ASSESS_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_completion_tokens=1024,
        )
    except openai.OpenAIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM call failed: {type(exc).__name__}: {exc}",
        )

    raw_json = completion.choices[0].message.content or "{}"

    # ------------------------------------------------------------------
    # 4. Validate strict Pydantic schema
    # ------------------------------------------------------------------
    try:
        parsed_dict = json.loads(raw_json)
        verdict = AssessmentVerdict.model_validate(parsed_dict)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM response failed schema validation: {exc}. Raw: {raw_json[:400]}",
        )

    # ------------------------------------------------------------------
    # 5 + 6. Persist verdict, route workflow
    # ------------------------------------------------------------------
    routing = "approval_gate" if verdict.confidence < confidence_threshold else "auto_complete"
    approval_request_id: Optional[int] = None

    with get_conn() as conn, conn.cursor() as cur:
        # 5a. Persist to agentops_py.assessments
        cur.execute(
            """
            INSERT INTO agentops_py.assessments
                (workflow_run_id, recommendation, confidence, risks,
                 evidence_refs, next_actions, retrieval_mode, retrieval_query, routing)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s)
            RETURNING id
            """,
            (
                workflow_id,
                verdict.recommendation,
                verdict.confidence,
                json.dumps(verdict.risks),
                json.dumps(verdict.evidence_references),
                json.dumps(verdict.next_actions),
                retrieval_mode,
                retrieval_query[:1000],
                routing,
            ),
        )
        assessment_row = cur.fetchone()
        if assessment_row is None:
            raise HTTPException(status_code=500, detail="Failed to insert assessment")
        assessment_id: int = assessment_row[0]

        if routing == "approval_gate":
            # 5b. Create approval_requests row
            cur.execute(
                """
                INSERT INTO approval_requests
                    (workflow_run_id, status, risk_level, summary, recommendation)
                VALUES (%s, 'pending', %s, %s, %s)
                RETURNING id
                """,
                (
                    workflow_id,
                    wf_risk,
                    f"RAG assessment: confidence={verdict.confidence:.2f} (below threshold {confidence_threshold:.2f}). "
                    f"Risks: {'; '.join(verdict.risks[:3]) if verdict.risks else 'none identified'}",
                    verdict.recommendation,
                ),
            )
            ar_row = cur.fetchone()
            if ar_row:
                approval_request_id = ar_row[0]

            # Advance workflow to approval_pending
            cur.execute(
                """
                UPDATE workflow_runs
                SET status = 'approval_pending', current_stage = 'approval_pending'
                WHERE id = %s
                """,
                (workflow_id,),
            )
            new_wf_status = "approval_pending"

        else:
            # 5c. Auto-complete: finalize the workflow
            cur.execute(
                """
                UPDATE workflow_runs
                SET status               = 'finalized',
                    current_stage        = 'finalized',
                    final_recommendation = %s,
                    next_actions         = %s::jsonb,
                    summary              = %s,
                    completed_at         = %s
                WHERE id = %s
                """,
                (
                    verdict.recommendation,
                    json.dumps(verdict.next_actions),
                    f"Auto-completed by assessment. Confidence={verdict.confidence:.2f}.",
                    datetime.now(tz=timezone.utc),
                    workflow_id,
                ),
            )
            new_wf_status = "finalized"

        # 5d. Update approval_request_id on the assessment row
        if approval_request_id:
            cur.execute(
                "UPDATE agentops_py.assessments SET approval_request_id = %s WHERE id = %s",
                (approval_request_id, assessment_id),
            )

        conn.commit()

    return AssessmentResponse(
        assessment_id=assessment_id,
        workflow_run_id=workflow_id,
        routing=routing,
        verdict=verdict,
        retrieval_mode=retrieval_mode,
        retrieval_chunks_used=len(chunks),
        approval_request_id=approval_request_id,
        workflow_status=new_wf_status,
    )


# ---------------------------------------------------------------------------
# GET /workflow/{workflow_id}
# ---------------------------------------------------------------------------

@app.get("/workflow/{workflow_id}", response_model=WorkflowStateResponse, tags=["query"])
def get_workflow(workflow_id: int) -> WorkflowStateResponse:
    """
    Return the full current state of a workflow run.

    Includes:
    - The workflow_runs row (status, stage, risk, costs, summaries)
    - The joined operational_requests row (title, description, etc.)
    - All agent_steps rows from the agent-step ledger
    - All tool_calls rows from the tool-call ledger
    """
    with get_conn() as conn, conn.cursor() as cur:
        # Main workflow + request join.
        cur.execute(
            """
            SELECT
                wr.id, wr.status, wr.current_stage, wr.risk_level,
                wr.estimated_cost_cents, wr.final_recommendation,
                wr.summary, wr.started_at, wr.completed_at, wr.created_at,
                or2.id AS req_id, or2.title, or2.description,
                or2.department, or2.priority, or2.requested_by,
                or2.portfolio_company_id
            FROM workflow_runs wr
            JOIN operational_requests or2 ON or2.id = wr.request_id
            WHERE wr.id = %s
            """,
            (workflow_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"workflow_run {workflow_id} not found",
            )

        (
            wf_id, status, current_stage, risk_level,
            estimated_cost_cents, final_recommendation,
            summary, started_at, completed_at, created_at,
            req_id, title, description,
            department, priority, requested_by,
            portfolio_company_id,
        ) = row

        # Agent step ledger.
        cur.execute(
            """
            SELECT id, name, status, step_index, started_at, completed_at
            FROM agent_steps
            WHERE workflow_run_id = %s
            ORDER BY step_index, id
            """,
            (workflow_id,),
        )
        agent_steps = [
            AgentStepSummary(
                id=r[0],
                name=r[1],
                status=r[2],
                step_index=r[3],
                started_at=r[4],
                completed_at=r[5],
            )
            for r in cur.fetchall()
        ]

        # Tool-call ledger.
        cur.execute(
            """
            SELECT id, tool_name, status, output_summary, duration_ms, created_at
            FROM tool_calls
            WHERE workflow_run_id = %s
            ORDER BY created_at, id
            """,
            (workflow_id,),
        )
        tool_calls = [
            ToolCallSummary(
                id=r[0],
                tool_name=r[1],
                status=r[2],
                output_summary=r[3],
                duration_ms=r[4],
                created_at=r[5],
            )
            for r in cur.fetchall()
        ]

    return WorkflowStateResponse(
        workflow_run_id=wf_id,
        operational_request_id=req_id,
        title=title,
        description=description,
        department=department,
        priority=priority,
        requested_by=requested_by,
        portfolio_company_id=portfolio_company_id,
        status=status,
        current_stage=current_stage,
        risk_level=risk_level,
        estimated_cost_cents=estimated_cost_cents,
        final_recommendation=final_recommendation,
        summary=summary,
        created_at=created_at,
        started_at=started_at,
        completed_at=completed_at,
        agent_steps=agent_steps,
        tool_calls=tool_calls,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8008"))
    uvicorn.run(app, host="0.0.0.0", port=port)
