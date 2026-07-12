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

import asyncio
import logging
import os
import sys
from typing import Any, TypedDict

from fastapi import FastAPI
from pydantic import BaseModel, Field

from db import check_connection
from embedding import embed_text, EMBEDDING_DIMENSIONS
from memory_store import (
    ensure_spike_document,
    store_chunk,
    vector_search,
    keyword_search,
    hit_to_dict,
    clear_document_chunks,
    has_embeddings,
)

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


_logger = logging.getLogger(__name__)

app = FastAPI(title="AgentOps LangGraph Worker (spike)", version="0.1.0")


@app.on_event("startup")
async def _startup_db_check() -> None:
    """Confirm the agentops_py async engine can reach the database."""
    result = await check_connection()
    if result["status"] == "ok":
        _logger.info(
            "agentops_py async DB ready | schema=%s | %s",
            result["current_schema"],
            result["pg_version"],
        )
        print(
            f"[agentops_py] async DB ready | schema={result['current_schema']} | {result['pg_version']}",
            flush=True,
        )
    else:
        _logger.error(
            "agentops_py async DB check failed: %s",
            result.get("error", "unknown"),
        )
        print(
            f"[agentops_py] async DB check FAILED: {result.get('error', 'unknown')}",
            flush=True,
        )


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


# ---------------------------------------------------------------------------
# Phase 1C: vector memory spike endpoints
# ---------------------------------------------------------------------------


class EmbedSpikeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


class EmbedSpikeResponse(BaseModel):
    status: str
    mode: str
    dimensions: int
    stored: bool
    chunkId: int | None = None
    documentId: int | None = None
    reason: str | None = None


class SearchSpikeRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(5, ge=1, le=20)


class SearchSpikeResponse(BaseModel):
    status: str
    mode: str  # "vector" | "keyword_fallback" | "empty"
    results: list[dict[str, Any]]
    embeddingMode: str | None = None
    reason: str | None = None


@app.post("/worker/memory/embed-spike", response_model=EmbedSpikeResponse)
def embed_spike(req: EmbedSpikeRequest) -> EmbedSpikeResponse:
    emb = embed_text(req.text)
    stored = False
    chunk_id: int | None = None
    document_id: int | None = None
    store_reason: str | None = emb.reason
    try:
        document_id = ensure_spike_document()
        chunk_id = store_chunk(document_id, req.text, emb.vector)
        stored = True
    except Exception as exc:  # surfaced in response, never raises to client
        store_reason = (store_reason + "; " if store_reason else "") + (
            f"store_failed: {type(exc).__name__}"
        )
    return EmbedSpikeResponse(
        status="ok",
        mode=emb.mode,
        dimensions=emb.dimensions,
        stored=stored,
        chunkId=chunk_id,
        documentId=document_id,
        reason=store_reason,
    )


def _chunk_text(content: str, max_chars: int = 800) -> list[str]:
    """Split on double-newlines first, then hard-cut if a paragraph exceeds max_chars."""
    paras = [p.strip() for p in content.split("\n\n") if p.strip()]
    result: list[str] = []
    for para in paras:
        if len(para) <= max_chars:
            result.append(para)
        else:
            for i in range(0, len(para), max_chars):
                part = para[i : i + max_chars].strip()
                if part:
                    result.append(part)
    return result or [content[:max_chars]]


class EmbedDocumentRequest(BaseModel):
    documentId: int
    content: str = Field(..., min_length=1, max_length=100_000)
    title: str = Field("", max_length=500)


class EmbedDocumentResponse(BaseModel):
    status: str
    documentId: int
    chunksEmbedded: int
    chunksCleared: int
    embeddingMode: str
    reason: str | None = None


@app.post("/worker/memory/embed-document", response_model=EmbedDocumentResponse)
def embed_document_endpoint(req: EmbedDocumentRequest) -> EmbedDocumentResponse:
    """Chunk and embed a real knowledge document into memory_chunks."""
    chunks = _chunk_text(req.content)
    cleared = clear_document_chunks(req.documentId)
    embedded = 0
    last_mode = "demo"
    last_reason: str | None = None
    for chunk in chunks:
        emb = embed_text(chunk)
        last_mode = emb.mode
        if emb.reason:
            last_reason = emb.reason
        store_chunk(req.documentId, chunk, emb.vector)
        embedded += 1
    return EmbedDocumentResponse(
        status="ok",
        documentId=req.documentId,
        chunksEmbedded=embedded,
        chunksCleared=cleared,
        embeddingMode=last_mode,
        reason=last_reason,
    )


class HasEmbeddingsResponse(BaseModel):
    documentId: int
    hasEmbeddings: bool
    chunkCount: int


@app.get("/worker/memory/has-embeddings/{document_id}", response_model=HasEmbeddingsResponse)
def check_has_embeddings(document_id: int) -> HasEmbeddingsResponse:
    """Check whether a document already has embeddings stored."""
    import psycopg, os
    url = os.environ.get("DATABASE_URL")
    count = 0
    if url:
        with psycopg.connect(url) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM memory_chunks WHERE document_id = %s AND embedding IS NOT NULL",
                (document_id,),
            )
            row = cur.fetchone()
            count = int(row[0]) if row else 0
    return HasEmbeddingsResponse(
        documentId=document_id,
        hasEmbeddings=count > 0,
        chunkCount=count,
    )


@app.post("/worker/memory/search-spike", response_model=SearchSpikeResponse)
def search_spike(req: SearchSpikeRequest) -> SearchSpikeResponse:
    emb = embed_text(req.query)
    # Try vector path first.
    try:
        hits = vector_search(emb.vector, limit=req.limit)
    except Exception as exc:
        # DB or pgvector failure → keyword fallback.
        try:
            kw = keyword_search(req.query, limit=req.limit)
            return SearchSpikeResponse(
                status="ok",
                mode="keyword_fallback",
                results=[hit_to_dict(h) for h in kw],
                embeddingMode=emb.mode,
                reason=f"vector_failed: {type(exc).__name__}",
            )
        except Exception as kw_exc:
            return SearchSpikeResponse(
                status="ok",
                mode="empty",
                results=[],
                embeddingMode=emb.mode,
                reason=f"vector_failed: {type(exc).__name__}; keyword_failed: {type(kw_exc).__name__}",
            )
    if hits:
        return SearchSpikeResponse(
            status="ok",
            mode="vector",
            results=[hit_to_dict(h) for h in hits],
            embeddingMode=emb.mode,
        )
    # Vector returned 0 rows (no embeddings yet) → keyword fallback.
    try:
        kw = keyword_search(req.query, limit=req.limit)
    except Exception as kw_exc:
        return SearchSpikeResponse(
            status="ok",
            mode="empty",
            results=[],
            embeddingMode=emb.mode,
            reason=f"keyword_failed: {type(kw_exc).__name__}",
        )
    return SearchSpikeResponse(
        status="ok",
        mode="keyword_fallback" if kw else "empty",
        results=[hit_to_dict(h) for h in kw],
        embeddingMode=emb.mode,
        reason="no_vector_rows",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("WORKER_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
