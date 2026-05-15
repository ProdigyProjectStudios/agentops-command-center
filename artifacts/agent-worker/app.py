"""AgentOps LangGraph Worker — Phase 1B capability spike.

A minimal FastAPI service that proves this Replit project can host a
Python/LangGraph worker alongside the existing Node/Express API and
React UI. This is intentionally tiny — it does not implement the real
agent graph yet. Its only job is to demonstrate that the runtime, the
imports, the graph machinery, and the cross-service HTTP call path all
work end to end.

See artifacts/agent-worker/README.md for context and the production
extension path.
"""

from __future__ import annotations

import os
import sys
from typing import Any, TypedDict

from fastapi import FastAPI
from pydantic import BaseModel, Field

try:
    from langgraph.graph import StateGraph, START, END

    LANGGRAPH_AVAILABLE = True
    LANGGRAPH_IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover - surfaced via /worker/health
    StateGraph = None  # type: ignore[assignment]
    START = END = None  # type: ignore[assignment]
    LANGGRAPH_AVAILABLE = False
    LANGGRAPH_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


SERVICE_NAME = "agentops-langgraph-worker"


class SpikeState(TypedDict, total=False):
    """Shared state passed between graph nodes."""

    workflowId: str
    requestText: str
    classification: str
    legalRisks: list[str]
    approvalRequired: bool
    finalSummary: str
    nodesRun: list[str]


def _record(state: SpikeState, node: str) -> list[str]:
    """Append a node name to the audit trail in state."""
    history = list(state.get("nodesRun", []))
    history.append(node)
    return history


def ops_node(state: SpikeState) -> SpikeState:
    """Classify the inbound request — deterministic keyword-based stub."""
    text = (state.get("requestText") or "").lower()
    if "contractor" in text or "subcontract" in text:
        classification = "vendor_onboarding"
    elif "marketing" in text or "campaign" in text:
        classification = "marketing_spend"
    elif "hire" in text or "hiring" in text:
        classification = "hiring_request"
    else:
        classification = "general_operations"
    return {
        "classification": classification,
        "nodesRun": _record(state, "ops_node"),
    }


def legal_node(state: SpikeState) -> SpikeState:
    """Flag pilot-grade legal risks based on the classification."""
    risks: list[str] = []
    classification = state.get("classification", "")
    text = (state.get("requestText") or "").lower()
    if classification == "vendor_onboarding":
        risks.append("Verify W-9, COI, and state-specific licensing before onboarding.")
    if "texas" in text:
        risks.append("Confirm Texas Department of Licensing and Regulation requirements.")
    if "roof" in text:
        risks.append("Roofing contracts must include lien waiver and workers' comp proof.")
    return {
        "legalRisks": risks,
        "nodesRun": _record(state, "legal_node"),
    }


def approval_pause_simulated_node(state: SpikeState) -> SpikeState:
    """Simulate the human-in-the-loop pause.

    In the production worker this node will call ``interrupt()`` and the
    LangGraph PostgresSaver checkpointer will persist state until a human
    decision arrives. For the spike we just record that approval would
    have been required.
    """
    needs_approval = bool(state.get("legalRisks")) or state.get(
        "classification"
    ) in {"vendor_onboarding", "marketing_spend", "hiring_request"}
    return {
        "approvalRequired": needs_approval,
        "nodesRun": _record(state, "approval_pause_simulated"),
    }


def final_node(state: SpikeState) -> SpikeState:
    """Compose a deterministic executive summary."""
    classification = state.get("classification", "unknown")
    risks = state.get("legalRisks", [])
    approval = state.get("approvalRequired", False)
    risk_count = len(risks)
    summary = (
        f"Spike workflow {state.get('workflowId', '?')} classified as "
        f"{classification}. {risk_count} legal risk(s) identified. "
        f"Approval required: {'yes' if approval else 'no'}."
    )
    return {
        "finalSummary": summary,
        "nodesRun": _record(state, "final_node"),
    }


def build_graph() -> Any:
    """Wire the four-node spike graph. Raises if LangGraph is unavailable."""
    if not LANGGRAPH_AVAILABLE:
        raise RuntimeError(
            f"LangGraph not available: {LANGGRAPH_IMPORT_ERROR}"
        )
    graph = StateGraph(SpikeState)
    graph.add_node("ops_node", ops_node)
    graph.add_node("legal_node", legal_node)
    graph.add_node("approval_pause_simulated", approval_pause_simulated_node)
    graph.add_node("final_node", final_node)
    graph.add_edge(START, "ops_node")
    graph.add_edge("ops_node", "legal_node")
    graph.add_edge("legal_node", "approval_pause_simulated")
    graph.add_edge("approval_pause_simulated", "final_node")
    graph.add_edge("final_node", END)
    return graph.compile()


# Compile once at import time so /worker/run-spike is fast and any
# wiring error fails loudly at startup.
COMPILED_GRAPH = build_graph() if LANGGRAPH_AVAILABLE else None


# ---------------------------------------------------------------------------
# FastAPI surface
# ---------------------------------------------------------------------------


class SpikeRequest(BaseModel):
    workflowId: str = Field(..., min_length=1, max_length=128)
    requestText: str = Field(..., min_length=1, max_length=4000)


class SpikeResponseState(BaseModel):
    classification: str
    legalRisks: list[str]
    approvalRequired: bool
    finalSummary: str


class SpikeResponse(BaseModel):
    workflowId: str
    status: str
    nodesRun: list[str]
    state: SpikeResponseState


class HealthResponse(BaseModel):
    status: str
    service: str
    python: str
    langgraph_available: bool
    langgraph_error: str | None = None


app = FastAPI(title="AgentOps LangGraph Worker (spike)", version="0.1.0")


@app.get("/worker/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        python=sys.version.split()[0],
        langgraph_available=LANGGRAPH_AVAILABLE,
        langgraph_error=LANGGRAPH_IMPORT_ERROR,
    )


@app.post("/worker/run-spike", response_model=SpikeResponse)
def run_spike(req: SpikeRequest) -> SpikeResponse:
    if COMPILED_GRAPH is None:
        raise RuntimeError(
            f"LangGraph unavailable at startup: {LANGGRAPH_IMPORT_ERROR}"
        )
    initial: SpikeState = {
        "workflowId": req.workflowId,
        "requestText": req.requestText,
        "nodesRun": [],
    }
    final_state = COMPILED_GRAPH.invoke(initial)
    return SpikeResponse(
        workflowId=req.workflowId,
        status="completed",
        nodesRun=list(final_state.get("nodesRun", [])),
        state=SpikeResponseState(
            classification=final_state.get("classification", ""),
            legalRisks=list(final_state.get("legalRisks", [])),
            approvalRequired=bool(final_state.get("approvalRequired", False)),
            finalSummary=final_state.get("finalSummary", ""),
        ),
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("WORKER_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
