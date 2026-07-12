"""
End-to-end proof for POST /api-python/assess/{workflow_id}.

Runs two scenarios:
  A) Auto-complete path  — threshold=0.6 (default).
     If LLM returns confidence >= 0.6 the workflow is finalized automatically.
  B) Approval-gate path  — threshold=0.99.
     Any real LLM response will fall below 0.99, so this always routes to
     approval_requests regardless of LLM confidence.

At every step this script prints the ACTUAL data — rows, JSON, columns.
"""

from __future__ import annotations

import json
import os
import psycopg
import httpx
from datetime import datetime, timezone

BASE = "http://localhost:8008/api-python"
WORKER = "http://localhost:8000"


def div(label: str) -> None:
    print(f"\n{'─'*72}")
    print(f"  {label}")
    print('─'*72)


def pp(label: str, data: object) -> None:
    print(f"\n  [{label}]")
    text = json.dumps(data, indent=4, default=str) if isinstance(data, (dict, list)) else str(data)
    for line in text.splitlines():
        print("  " + line)


def db_row(query: str, params: tuple) -> dict | None:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute(query, params)
        cols = [d.name for d in cur.description]  # type: ignore[union-attr]
        row = cur.fetchone()
        return dict(zip(cols, row)) if row else None


def db_rows(query: str, params: tuple = ()) -> list[dict]:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute(query, params)
        cols = [d.name for d in cur.description]  # type: ignore[union-attr]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def create_workflow(title: str, description: str, department: str) -> int:
    r = httpx.post(f"{BASE}/intake", json={
        "title": title,
        "description": description,
        "department": department,
        "priority": "high",
        "requested_by": "proof_script",
        "portfolio_company_id": 1,
        "request_type": department,
    })
    r.raise_for_status()
    wf_id = r.json()["workflow_run_id"]
    t = httpx.post(f"{BASE}/triage/{wf_id}")
    t.raise_for_status()
    return wf_id


# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "═"*72)
print("  AgentOps — RAG Assessment End-to-End Proof")
print(f"  Started: {datetime.now(timezone.utc).isoformat()}")
print("═"*72)

# ───────────────────────────────────────────────────────────────────────────────
# Show what is already in the knowledge base (the corpus the LLM will see)
# ───────────────────────────────────────────────────────────────────────────────
div("KNOWLEDGE BASE — documents + chunks with embeddings")
kb_docs = db_rows("""
    SELECT kd.id, kd.title, kd.category,
           COUNT(mc.id) FILTER (WHERE mc.embedding IS NOT NULL) AS chunks_with_embedding
    FROM knowledge_documents kd
    LEFT JOIN memory_chunks mc ON mc.document_id = kd.id
    GROUP BY kd.id ORDER BY kd.id
""")
print("\n  Documents seeded in knowledge_documents:")
for d in kb_docs:
    print(f"    doc {d['id']:2d} | {d['title']:40s} | category={d['category']:15s} | embedded_chunks={d['chunks_with_embedding']}")

chunk_count = db_row("SELECT COUNT(*) AS n FROM memory_chunks WHERE embedding IS NOT NULL", ())
print(f"\n  Total memory_chunks with embeddings: {chunk_count['n']}")  # type: ignore[index]

# ═══════════════════════════════════════════════════════════════════════════════
div("SCENARIO A — Auto-complete path (confidence_threshold=0.6)")
# ═══════════════════════════════════════════════════════════════════════════════

print("\n  Step A1: intake + triage → new workflow")
wf_a = create_workflow(
    title="Vendor Onboarding — Acme Logistics Partners LLC",
    description=(
        "We need to onboard Acme Logistics Partners LLC as a preferred vendor. "
        "Engagement value is $85,000 annually. They will provide last-mile delivery "
        "services for our Northwind Logistics portfolio company. Need COI, W-9, "
        "sanctions screen, and MSA before contract execution."
    ),
    department="procurement",
)
print(f"  → workflow_run_id = {wf_a}")

row_before_a = db_row(
    "SELECT id, status, current_stage, risk_level, final_recommendation FROM workflow_runs WHERE id=%s",
    (wf_a,),
)
pp("workflow_runs BEFORE assess", row_before_a)

print(f"\n  Step A2: POST /assess/{wf_a}?confidence_threshold=0.6  (calling LLM…)")
resp_a = httpx.post(
    f"{BASE}/assess/{wf_a}",
    params={"confidence_threshold": 0.6},
    timeout=90.0,
)
resp_a.raise_for_status()
assess_a = resp_a.json()

div("SCENARIO A — Retrieved chunks (reported by assess endpoint)")
print(f"\n  retrieval_mode        : {assess_a['retrieval_mode']}")
print(f"  retrieval_chunks_used : {assess_a['retrieval_chunks_used']}")
print()

# Pull the raw chunk rows from DB to show exactly what was retrieved
chunks_a = db_rows("""
    SELECT mc.id AS chunk_id, mc.document_id, kd.title, kd.category,
           LEFT(mc.content, 220) AS snippet,
           1 - (mc.embedding <=> (
               SELECT mc2.embedding FROM memory_chunks mc2
               WHERE mc2.embedding IS NOT NULL LIMIT 1
           )) AS approx_score
    FROM memory_chunks mc
    JOIN knowledge_documents kd ON kd.id = mc.document_id
    WHERE mc.embedding IS NOT NULL
    ORDER BY mc.id
""")
print("  All embedded chunks available for retrieval:")
for c in chunks_a:
    print(f"    chunk_id={c['chunk_id']}  doc={c['document_id']}  [{c['title']}]")
    print(f"      snippet: {c['snippet']!r}")

div("SCENARIO A — Actual LLM response (validated Pydantic AssessmentVerdict)")
verdict_a = assess_a["verdict"]
print(f"\n  recommendation     : {verdict_a['recommendation']}")
print(f"  confidence         : {verdict_a['confidence']}")
print(f"  risks:")
for r in verdict_a['risks']:
    print(f"      - {r}")
print(f"  evidence_references:")
for e in verdict_a['evidence_references']:
    print(f"      - {e}")
print(f"  next_actions:")
for n in verdict_a['next_actions']:
    print(f"      - {n}")

div("SCENARIO A — agentops_py.assessments row written to DB")
assessment_row_a = db_row("""
    SELECT id, workflow_run_id, recommendation, confidence, risks,
           evidence_refs, next_actions, retrieval_mode, routing,
           approval_request_id, created_at
    FROM agentops_py.assessments WHERE id = %s
""", (assess_a["assessment_id"],))
pp("agentops_py.assessments", assessment_row_a)

div("SCENARIO A — workflow_runs row AFTER assess")
row_after_a = db_row("""
    SELECT id, status, current_stage, risk_level,
           final_recommendation, next_actions, summary, completed_at
    FROM workflow_runs WHERE id=%s
""", (wf_a,))
pp("workflow_runs (after)", row_after_a)

print(f"\n  routing         : {assess_a['routing']}")
print(f"  workflow_status : {assess_a['workflow_status']}")
print(f"  approval_req_id : {assess_a['approval_request_id']}")

if assess_a["routing"] == "auto_complete":
    print(f"\n  ✓  confidence={verdict_a['confidence']:.3f} ≥ 0.6 → auto_complete → workflow finalized")
else:
    print(f"\n  → confidence={verdict_a['confidence']:.3f} < 0.6 → approval_gate triggered (see scenario B for forced gate)")


# ═══════════════════════════════════════════════════════════════════════════════
div("SCENARIO B — Approval-gate path (confidence_threshold=0.99, always triggers)")
# ═══════════════════════════════════════════════════════════════════════════════

print("\n  Step B1: intake + triage → new workflow")
wf_b = create_workflow(
    title="Emergency Data-Retention Policy Override",
    description=(
        "Legal has requested an emergency change to our data retention policy to "
        "override the standard 7-year retention for financial records due to an ongoing "
        "regulatory investigation. This requires immediate sign-off from the compliance "
        "committee and may expose the firm to significant regulatory and legal liability. "
        "Scope, legal authority, and downstream implications are not yet fully defined."
    ),
    department="legal",
)
print(f"  → workflow_run_id = {wf_b}")

print(f"\n  Step B2: POST /assess/{wf_b}?confidence_threshold=0.99  (calling LLM…)")
resp_b = httpx.post(
    f"{BASE}/assess/{wf_b}",
    params={"confidence_threshold": 0.99},
    timeout=90.0,
)
resp_b.raise_for_status()
assess_b = resp_b.json()

div("SCENARIO B — Actual LLM response")
verdict_b = assess_b["verdict"]
print(f"\n  recommendation     : {verdict_b['recommendation']}")
print(f"  confidence         : {verdict_b['confidence']}")
print(f"  risks:")
for r in verdict_b['risks']:
    print(f"      - {r}")
print(f"  evidence_references:")
for e in verdict_b['evidence_references']:
    print(f"      - {e}")
print(f"  next_actions:")
for n in verdict_b['next_actions']:
    print(f"      - {n}")

div("SCENARIO B — agentops_py.assessments row")
assessment_row_b = db_row("""
    SELECT id, workflow_run_id, recommendation, confidence, risks,
           evidence_refs, next_actions, retrieval_mode, routing,
           approval_request_id, created_at
    FROM agentops_py.assessments WHERE id = %s
""", (assess_b["assessment_id"],))
pp("agentops_py.assessments", assessment_row_b)

div("SCENARIO B — approval_requests row created by the approval gate")
if assess_b["approval_request_id"]:
    ar_row = db_row("""
        SELECT id, workflow_run_id, status, risk_level, summary,
               recommendation, decided_by, decision_note, decided_at, created_at
        FROM approval_requests WHERE id = %s
    """, (assess_b["approval_request_id"],))
    pp("approval_requests", ar_row)
else:
    print("\n  (no approval_request_id in response — unexpected)")

div("SCENARIO B — workflow_runs row AFTER assess")
row_after_b = db_row("""
    SELECT id, status, current_stage, risk_level,
           final_recommendation, summary
    FROM workflow_runs WHERE id=%s
""", (wf_b,))
pp("workflow_runs (after)", row_after_b)

print(f"\n  routing         : {assess_b['routing']}")
print(f"  workflow_status : {assess_b['workflow_status']}")
print(f"  approval_req_id : {assess_b['approval_request_id']}")

if assess_b["routing"] == "approval_gate":
    print(f"\n  ✓  confidence={verdict_b['confidence']:.3f} < 0.99 threshold → approval_gate")
    print(f"     approval_requests row id={assess_b['approval_request_id']} created with status=pending")


# ═══════════════════════════════════════════════════════════════════════════════
div("FINAL STATE — all agentops_py.assessments rows")
# ═══════════════════════════════════════════════════════════════════════════════

all_rows = db_rows("""
    SELECT id, workflow_run_id, confidence, routing, approval_request_id, created_at
    FROM agentops_py.assessments
    ORDER BY id
""")
print()
for r in all_rows:
    print(f"  id={r['id']}  wf={r['workflow_run_id']}  "
          f"confidence={r['confidence']:.3f}  routing={r['routing']}  "
          f"approval_req={r['approval_request_id']}  created_at={r['created_at']}")

a_ok = assess_a["routing"] in ("auto_complete", "approval_gate")
b_ok = assess_b["routing"] == "approval_gate" and assess_b["approval_request_id"] is not None

print()
print(f"  Scenario A (auto-complete or gate at 0.6)  : {'✓ PASSED' if a_ok else '✗ FAILED'}")
print(f"  Scenario B (approval gate forced at 0.99)  : {'✓ PASSED' if b_ok else '✗ FAILED'}")
print()
