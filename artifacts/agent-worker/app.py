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
import json
import os
import sys
import time
import traceback
import uuid
from collections import defaultdict
from threading import Lock
from typing import Any, TypedDict

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from log import get_logger, setup_logging

from db import check_connection, verify_schema
from embedding import embed_text, EMBEDDING_DIMENSIONS
from worker_loop import (
    ClaimedJob,
    enqueue_job,
    register_handler,
    start_worker_background,
    stop_worker_background,
)
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


setup_logging()
_log = get_logger("agent-worker")

app = FastAPI(title="AgentOps LangGraph Worker (spike)", version="0.1.0")

# ---------------------------------------------------------------------------
# Rate limiting — sliding-window per-IP (in-process, no external state)
# ---------------------------------------------------------------------------
_rl_counts: dict[str, list[float]] = defaultdict(list)
_rl_lock = Lock()
_RL_LIMIT = 60
_RL_WINDOW = 60.0


@app.middleware("http")
async def _rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _rl_lock:
        window = _rl_counts[ip]
        _rl_counts[ip] = [t for t in window if now - t < _RL_WINDOW]
        if len(_rl_counts[ip]) >= _RL_LIMIT:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "detail": f"Max {_RL_LIMIT} requests per {int(_RL_WINDOW)}s per IP",
                },
                headers={"Retry-After": str(int(_RL_WINDOW))},
            )
        _rl_counts[ip].append(now)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Security headers — applied to every response (outermost middleware)
# ---------------------------------------------------------------------------

@app.middleware("http")
async def _security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers.setdefault(
        "X-Request-ID",
        request.headers.get("X-Request-ID", str(uuid.uuid4())),
    )
    return response


@app.on_event("startup")
async def _startup_db_check() -> None:
    """Confirm the agentops_py schema exists and the async engine is scoped to it."""
    # 1 — Verify the schema exists in information_schema.schemata
    schema_result = await verify_schema()
    if schema_result["status"] == "ok":
        _log.info(
            "schema verified",
            extra={"schema_name": schema_result["schema_name"], "catalog": schema_result["owner"]},
        )
    elif schema_result["status"] == "missing":
        _log.error("schema NOT FOUND in information_schema.schemata")
    else:
        _log.error("schema check error", extra={"error": schema_result.get("error")})

    # 2 — Confirm search_path puts agentops_py first (current_schema check)
    conn_result = await check_connection()
    if conn_result["status"] == "ok":
        _log.info(
            "async db ready",
            extra={"current_schema": conn_result["current_schema"], "pg_version": conn_result["pg_version"]},
        )
    else:
        _log.error("async db check failed", extra={"error": conn_result.get("error", "unknown")})

    # 3 — Start the durable job worker loop as a background task
    start_worker_background()
    _log.info("durable worker loop started")


@app.get("/worker/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        python=sys.version.split()[0],
        langgraph_available=LANGGRAPH_AVAILABLE,
        langgraph_error=LANGGRAPH_IMPORT_ERROR,
    )


@app.post("/worker/run-spike", response_model=SpikeResponse)
async def run_spike(req: SpikeRequest) -> SpikeResponse:
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
async def embed_spike(req: EmbedSpikeRequest) -> EmbedSpikeResponse:
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
async def embed_document_endpoint(req: EmbedDocumentRequest) -> EmbedDocumentResponse:
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
async def check_has_embeddings(document_id: int) -> HasEmbeddingsResponse:
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
async def search_spike(req: SearchSpikeRequest) -> SearchSpikeResponse:
    """Semantic retrieval endpoint — stable production path.

    Route path is preserved for backwards compatibility; all callers
    (api-python /assess) reference this path directly.

    Retrieval strategy (three-tier, non-fatal):
      1. Embed the query via embed_text() (live OpenAI → demo fallback).
      2. vector_search() — cosine similarity over memory_chunks.embedding.
         Returns mode="vector" when hits exist.
      3. If vector_search raises or returns 0 rows → keyword_search() fallback.
         Returns mode="keyword_fallback".
      4. If both fail → mode="empty", empty results.

    Assessment is never blocked: all exception paths return HTTP 200.
    """
    emb = embed_text(req.query)
    # --- tier 1: pgvector cosine similarity ---
    try:
        hits = vector_search(emb.vector, limit=req.limit)
    except Exception as exc:
        # pgvector / DB failure → tier 2: keyword fallback
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
            # tier 3: both paths failed
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
    # Vector returned 0 rows (no embedded chunks yet) → tier 2: keyword fallback
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


# ---------------------------------------------------------------------------
# Durable worker endpoints
# ---------------------------------------------------------------------------


class EnqueueRequest(BaseModel):
    workflow: str = Field(..., min_length=1, max_length=255)
    stage: str = Field(..., min_length=1, max_length=255)


class EnqueueResponse(BaseModel):
    job_id: int
    workflow: str
    stage: str
    status: str


class JobSummary(BaseModel):
    id: int
    workflow: str
    stage: str
    status: str
    attempt_count: int
    last_error: str | None = None
    next_retry_at: str | None = None
    created_at: str
    updated_at: str
    run_count: int


class JobsResponse(BaseModel):
    jobs: list[JobSummary]
    total: int


@app.post("/worker/enqueue", response_model=EnqueueResponse)
async def enqueue(req: EnqueueRequest) -> EnqueueResponse:
    """Insert a new job into agentops_py.jobs with status=queued."""
    job_id = await enqueue_job(req.workflow, req.stage)
    return EnqueueResponse(
        job_id=job_id,
        workflow=req.workflow,
        stage=req.stage,
        status="queued",
    )


@app.get("/worker/jobs", response_model=JobsResponse)
async def list_jobs(limit: int = Query(default=50, ge=1, le=200)) -> JobsResponse:
    """Return recent jobs with their agent_run counts."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload
    from models import Job, AgentRun

    async with __import__("db").get_async_session() as session:
        stmt = (
            select(Job)
            .order_by(Job.created_at.desc())
            .limit(min(limit, 200))
        )
        rows = (await session.execute(stmt)).scalars().all()

        # Fetch run counts in one query
        job_ids = [j.id for j in rows]
        if job_ids:
            from sqlalchemy import func as sqlfunc
            counts_rows = (
                await session.execute(
                    select(AgentRun.job_id, sqlfunc.count(AgentRun.id).label("n"))
                    .where(AgentRun.job_id.in_(job_ids))
                    .group_by(AgentRun.job_id)
                )
            ).all()
            counts = {r.job_id: r.n for r in counts_rows}
        else:
            counts = {}

        summaries = [
            JobSummary(
                id=j.id,
                workflow=j.workflow,
                stage=j.stage,
                status=j.status,
                attempt_count=j.attempt_count,
                last_error=j.last_error,
                next_retry_at=j.next_retry_at.isoformat() if j.next_retry_at else None,
                created_at=j.created_at.isoformat(),
                updated_at=j.updated_at.isoformat(),
                run_count=counts.get(j.id, 0),
            )
            for j in rows
        ]

    return JobsResponse(jobs=summaries, total=len(summaries))


# ---------------------------------------------------------------------------
# Centralized exception handler
# ---------------------------------------------------------------------------

async def _write_error_event(
    endpoint: str,
    error_type: str,
    error_message: str,
    stack_trace: str,
    context: dict,
) -> None:
    """Write to agentops_py.error_events. Never raises."""
    try:
        from sqlalchemy import select as _select
        from models import ErrorEvent
        async with __import__("db").get_async_session() as session:
            ev = ErrorEvent(
                service="agent-worker",
                endpoint=endpoint,
                error_type=error_type,
                error_message=error_message[:4000],
                stack_trace=stack_trace[:8000],
                context=context,
            )
            session.add(ev)
            await session.commit()
    except Exception as db_err:
        _log.error("failed to persist error_event", extra={"db_error": str(db_err)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(req: Request, exc: Exception) -> JSONResponse:
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        raise exc
    tb = traceback.format_exc()
    error_type = type(exc).__name__
    error_msg = str(exc)
    context: dict = {
        "method": req.method,
        "path": req.url.path,
        "path_params": dict(req.path_params),
    }
    await _write_error_event(
        endpoint=req.url.path,
        error_type=error_type,
        error_message=error_msg,
        stack_trace=tb,
        context=context,
    )
    _log.error(
        "unhandled exception",
        extra={"endpoint": req.url.path, "error_type": error_type, "error": error_msg[:200]},
    )
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": error_type},
    )


# ---------------------------------------------------------------------------
# GET /worker/errors — in-Postgres error monitoring dashboard
# ---------------------------------------------------------------------------

@app.get("/worker/errors", tags=["ops"])
async def get_worker_errors(limit: int = Query(default=20, ge=1, le=100)) -> list[dict]:
    """Return recent error_events for agent-worker, newest first."""
    from sqlalchemy import select
    from models import ErrorEvent
    async with __import__("db").get_async_session() as session:
        rows = (
            await session.execute(
                select(ErrorEvent)
                .where(ErrorEvent.service == "agent-worker")
                .order_by(ErrorEvent.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
    return [
        {
            "id": e.id,
            "service": e.service,
            "endpoint": e.endpoint,
            "error_type": e.error_type,
            "error_message": e.error_message,
            "stack_trace": e.stack_trace,
            "context": e.context,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]


# ---------------------------------------------------------------------------
# GET /worker/test-error — deliberate trigger for end-to-end proof
# ---------------------------------------------------------------------------

@app.get("/worker/test-error", tags=["ops"])
async def trigger_test_error() -> None:
    """Raise a RuntimeError to prove exception handler → error_events pipeline."""
    raise RuntimeError("deliberate test error — exception handler + error_events proof")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("WORKER_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
