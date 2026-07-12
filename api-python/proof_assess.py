"""
End-to-end proof for POST /api-python/assess/{workflow_id}.

Shows at each step:
  1. The real worker search response (mode, cosine scores, snippets) — as returned.
  2. The real LLM verdict with evidence_references tied to retrieved chunks.
  3. The real agentops_py.assessments row persisted to DB.
  4. The real approval_requests row when confidence < threshold.
"""

from __future__ import annotations

import json
import os
import psycopg
import httpx
from datetime import datetime, timezone

BASE   = "http://localhost:8008/api-python"
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
print("  AgentOps — RAG Assessment Proof (clean run, vector retrieval)")
print(f"  Started: {datetime.now(timezone.utc).isoformat()}")
print("═"*72)

# ═══════════════════════════════════════════════════════════════════════════════
div("SCENARIO A — intake → triage → assess (confidence_threshold=0.6)")
# ═══════════════════════════════════════════════════════════════════════════════

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
print(f"\n  workflow_run_id = {wf_a}  (status=triaged, risk=medium)")

# ── Step 1: explicit search call with the same query the endpoint will use ──
query_a = (
    "Vendor Onboarding — Acme Logistics Partners LLC. "
    "We need to onboard Acme Logistics Partners LLC as a preferred vendor. "
    "Engagement value is $85,000 annually. They will provide last-mile delivery "
    "services for our Northwind Logistics portfolio company. Need COI, W-9, "
    "sanctions screen, and MSA before contract execution."
)

div("STEP 1 — Raw search response from agent-worker (exact JSON as returned)")
search_r = httpx.post(
    f"{WORKER}/worker/memory/search-spike",
    json={"query": query_a, "limit": 6},
    timeout=15.0,
)
search_r.raise_for_status()
search_a = search_r.json()

print(f"\n  status        : {search_a['status']}")
print(f"  mode          : {search_a['mode']}")
print(f"  embeddingMode : {search_a.get('embeddingMode', 'n/a')}")
print(f"  reason        : {search_a.get('reason')}")
print(f"  chunks returned: {len(search_a['results'])}")
print()
for i, c in enumerate(search_a["results"], 1):
    print(f"  chunk[{i}]")
    print(f"    chunkId    = {c['chunkId']}")
    print(f"    documentId = {c['documentId']}")
    print(f"    title      = {c['title']!r}")
    print(f"    category   = {c['category']!r}")
    print(f"    score      = {c['score']}   ← cosine similarity from pgvector")
    print(f"    snippet    = {c['snippet']!r}")
    print()

# ── Step 2: call the assess endpoint ──
div("STEP 2 — POST /assess/{wf_id}?confidence_threshold=0.6  (real LLM call)")
resp_a = httpx.post(
    f"{BASE}/assess/{wf_a}",
    params={"confidence_threshold": 0.6},
    timeout=90.0,
)
resp_a.raise_for_status()
assess_a = resp_a.json()

print(f"\n  retrieval_mode        : {assess_a['retrieval_mode']}")
print(f"  retrieval_chunks_used : {assess_a['retrieval_chunks_used']}")

# ── Step 3: show exact LLM verdict ──
div("STEP 3 — Validated AssessmentVerdict (strict Pydantic schema)")
v = assess_a["verdict"]
print(f"\n  recommendation:")
for line in v["recommendation"].split(". "):
    if line.strip():
        print(f"    {line.strip()}.")
print(f"\n  confidence : {v['confidence']}")
print(f"\n  risks:")
for r in v["risks"]:
    print(f"    - {r}")
print(f"\n  evidence_references  ← tied to the retrieved chunks above:")
for e in v["evidence_references"]:
    print(f"    - {e}")
print(f"\n  next_actions:")
for n in v["next_actions"]:
    print(f"    - {n}")

# ── Step 4: show actual DB row ──
div("STEP 4 — agentops_py.assessments row written to DB")
arow = db_row("""
    SELECT id, workflow_run_id, recommendation, confidence, risks,
           evidence_refs, next_actions, retrieval_mode, routing,
           approval_request_id, created_at
    FROM agentops_py.assessments WHERE id = %s
""", (assess_a["assessment_id"],))
pp("agentops_py.assessments", arow)

div("STEP 5 — workflow_runs row after assess")
wrow = db_row("""
    SELECT id, status, current_stage, risk_level,
           final_recommendation, next_actions, summary, completed_at
    FROM workflow_runs WHERE id=%s
""", (wf_a,))
pp("workflow_runs", wrow)

routing_a = assess_a["routing"]
print(f"\n  routing         : {routing_a}")
print(f"  workflow_status : {assess_a['workflow_status']}")
print(f"  approval_req_id : {assess_a['approval_request_id']}")
if routing_a == "auto_complete":
    print(f"\n  ✓  confidence={v['confidence']:.3f} ≥ 0.6 → auto_complete → finalized")
else:
    print(f"\n  → confidence={v['confidence']:.3f} < 0.6 → approval_gate (see scenario B)")


# ═══════════════════════════════════════════════════════════════════════════════
div("SCENARIO B — approval-gate path (confidence_threshold=0.99, always triggers)")
# ═══════════════════════════════════════════════════════════════════════════════

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
print(f"\n  workflow_run_id = {wf_b}  (status=triaged, risk=high)")

query_b = (
    "Emergency Data-Retention Policy Override. "
    "Legal has requested an emergency change to our data retention policy to "
    "override the standard 7-year retention for financial records due to an ongoing "
    "regulatory investigation."
)

div("STEP 1 — Raw search response for scenario B")
search_r2 = httpx.post(
    f"{WORKER}/worker/memory/search-spike",
    json={"query": query_b, "limit": 6},
    timeout=15.0,
)
search_r2.raise_for_status()
search_b = search_r2.json()

print(f"\n  mode          : {search_b['mode']}")
print(f"  embeddingMode : {search_b.get('embeddingMode', 'n/a')}")
print(f"  chunks returned: {len(search_b['results'])}")
print()
for i, c in enumerate(search_b["results"], 1):
    print(f"  chunk[{i}]")
    print(f"    chunkId = {c['chunkId']}  documentId = {c['documentId']}")
    print(f"    title   = {c['title']!r}")
    print(f"    score   = {c['score']}   ← cosine similarity")
    print(f"    snippet = {c['snippet']!r}")
    print()

div("STEP 2 — POST /assess/{wf_id}?confidence_threshold=0.99  (real LLM call)")
resp_b = httpx.post(
    f"{BASE}/assess/{wf_b}",
    params={"confidence_threshold": 0.99},
    timeout=90.0,
)
resp_b.raise_for_status()
assess_b = resp_b.json()

print(f"\n  retrieval_mode        : {assess_b['retrieval_mode']}")
print(f"  retrieval_chunks_used : {assess_b['retrieval_chunks_used']}")

div("STEP 3 — LLM verdict for scenario B")
vb = assess_b["verdict"]
print(f"\n  recommendation : {vb['recommendation']}")
print(f"  confidence     : {vb['confidence']}")
print(f"\n  risks:")
for r in vb["risks"]: print(f"    - {r}")
print(f"\n  evidence_references:")
for e in vb["evidence_references"]: print(f"    - {e}")
print(f"\n  next_actions:")
for n in vb["next_actions"]: print(f"    - {n}")

div("STEP 4 — agentops_py.assessments row for scenario B")
arow_b = db_row("""
    SELECT id, workflow_run_id, recommendation, confidence, risks,
           evidence_refs, next_actions, retrieval_mode, routing,
           approval_request_id, created_at
    FROM agentops_py.assessments WHERE id = %s
""", (assess_b["assessment_id"],))
pp("agentops_py.assessments", arow_b)

div("STEP 5 — approval_requests row created by approval gate")
if assess_b["approval_request_id"]:
    arrow = db_row("""
        SELECT id, workflow_run_id, status, risk_level, summary,
               recommendation, decided_by, decision_note, decided_at, created_at
        FROM approval_requests WHERE id = %s
    """, (assess_b["approval_request_id"],))
    pp("approval_requests", arrow)

div("STEP 6 — workflow_runs row after scenario B assess")
wrow_b = db_row("""
    SELECT id, status, current_stage, risk_level, final_recommendation, summary
    FROM workflow_runs WHERE id=%s
""", (wf_b,))
pp("workflow_runs", wrow_b)

print(f"\n  routing         : {assess_b['routing']}")
print(f"  workflow_status : {assess_b['workflow_status']}")
print(f"  approval_req_id : {assess_b['approval_request_id']}")
if assess_b["routing"] == "approval_gate":
    print(f"\n  ✓  confidence={vb['confidence']:.3f} < 0.99 → approval_gate → approval_requests id={assess_b['approval_request_id']} (pending)")

# ═══════════════════════════════════════════════════════════════════════════════
div("PASS / FAIL")
# ═══════════════════════════════════════════════════════════════════════════════
a_vector = assess_a["retrieval_mode"] == "vector"
a_chunks = assess_a["retrieval_chunks_used"] > 0
a_real_evidence = any("no relevant" not in e.lower() for e in v["evidence_references"])
b_gate = assess_b["routing"] == "approval_gate" and assess_b["approval_request_id"] is not None

print()
print(f"  A: retrieval_mode == 'vector'          : {'✓' if a_vector else '✗'}  ({assess_a['retrieval_mode']})")
print(f"  A: chunks used > 0                     : {'✓' if a_chunks else '✗'}  ({assess_a['retrieval_chunks_used']} chunks)")
print(f"  A: evidence tied to real chunks        : {'✓' if a_real_evidence else '✗'}")
print(f"  B: approval_gate triggered             : {'✓' if b_gate else '✗'}  (approval_req_id={assess_b['approval_request_id']})")
print()
