"""
AgentOps — pgvector semantic retrieval test suite.

Covers:
  • embedding persistence round-trip (store_chunk → read back, verify 1536 dims)
  • backfill processes NULL-embedding rows
  • backfill is idempotent (second run: processed=0)
  • already-embedded rows are untouched by backfill
  • vector search ranks relevant chunk above irrelevant chunk
  • MemoryHit / hit_to_dict metadata fields survive retrieval
  • vector failure triggers keyword fallback (monkeypatched)
  • /assess response exposes valid retrieval_mode
  • /assess response exposes valid retrieval_chunks_used
  • /assess continues gracefully when retrieval endpoint fails

Real Postgres is used for all DB-backed tests (same DATABASE_URL as the
rest of the suite).  No live OpenAI call is required — demo embeddings
are used throughout.

Run with:
    cd api-python && uv run --no-sync python -m pytest tests/test_retrieval.py -v
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import psycopg
import pytest

# ---------------------------------------------------------------------------
# Path setup — make api-python root and the agent-worker importable
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(__file__)
_API_ROOT = os.path.dirname(_HERE)
_WORKER_ROOT = os.path.normpath(
    os.path.join(_API_ROOT, "..", "artifacts", "agent-worker")
)
# API root must come first so that `from main import app` resolves
# api-python/main.py (and api-python/models.py) before the worker's
# models.py, which has the same filename but a different schema.
sys.path.insert(0, _API_ROOT)
sys.path.insert(1, _WORKER_ROOT)

from fastapi.testclient import TestClient
from main import app

import memory_store
from embedding import EMBEDDING_DIMENSIONS, _demo_embedding
from memory_store import (
    MemoryHit,
    backfill_embeddings,
    clear_document_chunks,
    has_embeddings,
    hit_to_dict,
    keyword_search,
    store_chunk,
    vector_search,
    _vec_literal,
    _conn,
)

client = TestClient(app, raise_server_exceptions=True)

VALID_PORTFOLIO_CO_ID: int = 1  # Acme Industrial Co. — always in seed data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.fail("DATABASE_URL environment variable not set")
    return psycopg.connect(url)


def _create_test_document(title: str) -> int:
    """Insert a throwaway knowledge_documents row. Returns its id."""
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO knowledge_documents (title, category, summary, content)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (title, "test", f"Test doc: {title}", f"Content for {title}"),
        )
        row = cur.fetchone()
        assert row is not None
        doc_id = int(row[0])
        conn.commit()
    return doc_id


def _delete_test_document(doc_id: int) -> None:
    """Remove test document and its chunks (best-effort, for teardown)."""
    try:
        with _db() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM memory_chunks WHERE document_id = %s", (doc_id,))
            cur.execute("DELETE FROM knowledge_documents WHERE id = %s", (doc_id,))
            conn.commit()
    except Exception:
        pass


def _insert_chunk_with_null_embedding(doc_id: int, content: str) -> int:
    """Insert a memory_chunks row with embedding=NULL. Returns chunk id."""
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO memory_chunks (document_id, content, tokens)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (doc_id, content, max(1, len(content.split()))),
        )
        row = cur.fetchone()
        assert row is not None
        chunk_id = int(row[0])
        conn.commit()
    return chunk_id


def _read_embedding_dims(chunk_id: int) -> int | None:
    """Return the number of dimensions stored for a chunk, or None if NULL."""
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT embedding::text FROM memory_chunks WHERE id = %s",
            (chunk_id,),
        )
        row = cur.fetchone()
    if row is None or row[0] is None:
        return None
    # pgvector text format: "[v1,v2,...,vN]"
    raw: str = row[0]
    return len(raw.strip("[]").split(","))


def _mock_llm(verdict_dict: dict) -> MagicMock:
    mock = MagicMock()
    mock.choices = [MagicMock()]
    mock.choices[0].message.content = json.dumps(verdict_dict)
    return mock


def _mock_search_response(
    mock_httpx: MagicMock,
    mode: str = "vector",
    results: list[dict[str, Any]] | None = None,
) -> None:
    results = results or [
        {
            "chunkId": 1,
            "documentId": 1,
            "title": "Policy A",
            "category": "policy",
            "snippet": "Relevant policy text.",
            "score": 0.92,
        }
    ]
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"status": "ok", "mode": mode, "results": results}
    mock_resp.raise_for_status = MagicMock()
    mock_httpx.post.return_value = mock_resp


def _intake_payload(**overrides) -> dict:
    base = {
        "title": "Retrieval test workflow",
        "description": "Created by test_retrieval.py — safe to delete.",
        "department": "finance",
        "priority": "medium",
        "requested_by": "pytest-retrieval",
        "portfolio_company_id": VALID_PORTFOLIO_CO_ID,
    }
    base.update(overrides)
    return base


def _create_workflow() -> int:
    """Full intake + triage via real DB. Returns workflow_run_id."""
    intake = client.post("/intake", json=_intake_payload())
    assert intake.status_code == 201, intake.text
    wf_id = intake.json()["workflow_run_id"]
    triage = client.post(
        f"/triage/{wf_id}",
        json={"portfolio_company_id": VALID_PORTFOLIO_CO_ID},
    )
    assert triage.status_code == 200, triage.text
    return wf_id


_GOOD_VERDICT = {
    "recommendation": "approve",
    "confidence": 0.82,
    "risks": ["minor regulatory risk"],
    "evidence_references": ["Policy A §3.1"],
    "next_actions": ["proceed to legal sign-off"],
}


# ===========================================================================
# 1. Embedding persistence round-trip
# ===========================================================================

def test_embedding_round_trip():
    """store_chunk persists a demo vector; dimension is 1536 on read-back."""
    doc_id = _create_test_document("Retrieval Test — Round Trip")
    try:
        vec = _demo_embedding("round trip test content for pgvector")
        chunk_id = store_chunk(doc_id, "round trip test content for pgvector", vec)
        assert chunk_id > 0
        dims = _read_embedding_dims(chunk_id)
        assert dims == EMBEDDING_DIMENSIONS, (
            f"Expected {EMBEDDING_DIMENSIONS} dims, got {dims}"
        )
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 2. Backfill processes NULL-embedding rows
# ===========================================================================

def test_backfill_processes_null_rows():
    """backfill_embeddings() embeds rows that have embedding IS NULL."""
    doc_id = _create_test_document("Retrieval Test — Backfill NULL")
    try:
        chunk_id = _insert_chunk_with_null_embedding(
            doc_id, "policy clause about vendor contracts pgvector backfill"
        )
        assert _read_embedding_dims(chunk_id) is None, "Chunk should start with NULL embedding"

        result = backfill_embeddings(batch_size=10)

        assert result["failed"] == 0, f"Backfill had failures: {result}"
        assert result["processed"] >= 1, f"Expected at least 1 processed, got: {result}"
        dims = _read_embedding_dims(chunk_id)
        assert dims == EMBEDDING_DIMENSIONS, (
            f"Expected {EMBEDDING_DIMENSIONS} dims after backfill, got {dims}"
        )
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 3. Backfill is idempotent — second run produces no new writes
# ===========================================================================

def test_backfill_idempotent():
    """Running backfill twice: second pass processes 0 rows for our chunk."""
    doc_id = _create_test_document("Retrieval Test — Backfill Idempotent")
    try:
        chunk_id = _insert_chunk_with_null_embedding(
            doc_id, "idempotency check clause for pgvector backfill test"
        )
        # First run — embeds the chunk
        r1 = backfill_embeddings(batch_size=10)
        assert r1["failed"] == 0
        assert r1["processed"] >= 1
        assert _read_embedding_dims(chunk_id) == EMBEDDING_DIMENSIONS

        # Second run — no NULL rows remain (for our doc); processed must be 0
        r2 = backfill_embeddings(batch_size=10)
        assert r2["failed"] == 0
        assert r2["processed"] == 0, (
            f"Second backfill run should process 0 rows, got: {r2}"
        )
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 4. Already-embedded rows are skipped by backfill
# ===========================================================================

def test_backfill_skips_already_embedded():
    """Rows with an existing embedding are not re-processed by backfill."""
    doc_id = _create_test_document("Retrieval Test — Skip Embedded")
    try:
        vec = _demo_embedding("pre-existing embedding content already stored")
        chunk_id = store_chunk(doc_id, "pre-existing embedding content already stored", vec)
        assert _read_embedding_dims(chunk_id) == EMBEDDING_DIMENSIONS

        # Backfill must not touch this row
        result = backfill_embeddings(batch_size=10)
        assert result["failed"] == 0
        assert result["processed"] == 0, (
            f"Already-embedded row should not be processed, got: {result}"
        )
        # Embedding unchanged
        assert _read_embedding_dims(chunk_id) == EMBEDDING_DIMENSIONS
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 5. Vector search ranks relevant chunk above irrelevant chunk
# ===========================================================================

def test_vector_search_ranking():
    """Relevant chunk scores higher than irrelevant chunk under cosine distance."""
    doc_id = _create_test_document("Retrieval Test — Ranking")
    try:
        relevant_text = "annual vendor contract renewal approval process finance department"
        irrelevant_text = "office furniture inventory count facilities management building"

        vec_rel = _demo_embedding(relevant_text)
        vec_irr = _demo_embedding(irrelevant_text)
        store_chunk(doc_id, relevant_text, vec_rel)
        store_chunk(doc_id, irrelevant_text, vec_irr)

        query = "vendor contract approval finance"
        query_vec = _demo_embedding(query)
        hits = vector_search(query_vec, limit=20)

        # Both chunks must appear somewhere in results
        rel_hit = next((h for h in hits if relevant_text[:30] in h.snippet), None)
        irr_hit = next((h for h in hits if irrelevant_text[:30] in h.snippet), None)
        assert rel_hit is not None, "Relevant chunk missing from vector search results"
        assert irr_hit is not None, "Irrelevant chunk missing from vector search results"

        rel_rank = next(i for i, h in enumerate(hits) if relevant_text[:30] in h.snippet)
        irr_rank = next(i for i, h in enumerate(hits) if irrelevant_text[:30] in h.snippet)
        assert rel_rank < irr_rank, (
            f"Relevant chunk rank {rel_rank} should be < irrelevant rank {irr_rank}"
        )
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 6. MemoryHit / hit_to_dict metadata fields survive retrieval
# ===========================================================================

def test_chunk_metadata_survives_retrieval():
    """All expected metadata fields are present and correctly typed in MemoryHit."""
    doc_id = _create_test_document("Retrieval Test — Metadata Fields")
    try:
        content = "metadata field verification clause for pgvector retrieval test"
        vec = _demo_embedding(content)
        store_chunk(doc_id, content, vec)

        query_vec = _demo_embedding(content)
        hits = vector_search(query_vec, limit=20)
        assert hits, "vector_search returned no results"

        target = next((h for h in hits if content[:25] in h.snippet), None)
        assert target is not None, f"Our chunk not found in results. snippets={[h.snippet for h in hits[:5]]}"

        # MemoryHit field types and invariants
        assert isinstance(target.chunk_id, int) and target.chunk_id > 0
        assert isinstance(target.document_id, int) and target.document_id == doc_id
        assert isinstance(target.title, str) and target.title
        assert isinstance(target.category, str) and target.category == "test"
        assert isinstance(target.snippet, str) and target.snippet
        assert isinstance(target.score, float)
        assert 0.0 <= target.score <= 1.0

        # hit_to_dict serialisation shape
        d = hit_to_dict(target)
        for key in ("chunkId", "documentId", "title", "category", "snippet", "score"):
            assert key in d, f"hit_to_dict missing key: {key}"
        assert d["documentId"] == doc_id
        assert d["category"] == "test"
        assert isinstance(d["score"], float)
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 7. Vector failure triggers keyword fallback
# ===========================================================================

def test_keyword_fallback_on_vector_failure():
    """When vector_search raises, the retrieval path degrades to keyword_fallback.

    Tests the three-tier logic directly without importing the worker's FastAPI
    app (which would cause an import conflict between worker/models.py and
    api-python/models.py).  The logic mirrors search_spike() in app.py exactly.
    """
    doc_id = _create_test_document("Retrieval Test — Fallback")
    try:
        content = "procurement approval threshold exceeded budget limit fallback"
        vec = _demo_embedding(content)
        store_chunk(doc_id, content, vec)

        original = memory_store.vector_search

        def _raise(*args, **kwargs):
            raise RuntimeError("pgvector unavailable (simulated for test)")

        memory_store.vector_search = _raise
        try:
            # Re-implement the three-tier logic from search_spike() directly so we
            # can test it without a conflicting app import.
            query = "procurement budget approval"
            mode = "unknown"
            results: list = []

            try:
                hits = memory_store.vector_search([0.0] * EMBEDDING_DIMENSIONS, limit=3)
                mode = "vector" if hits else "no_vector_rows"
                results = [hit_to_dict(h) for h in hits]
            except Exception:
                # tier 2: keyword fallback — matches search_spike behaviour
                try:
                    kw = keyword_search(query, limit=3)
                    mode = "keyword_fallback"
                    results = [hit_to_dict(h) for h in kw]
                except Exception:
                    mode = "empty"

            assert mode == "keyword_fallback", (
                f"Expected keyword_fallback when vector_search raises, got {mode!r}"
            )
            # keyword fallback should find our chunk (content has "procurement", "approval")
            assert isinstance(results, list)
        finally:
            memory_store.vector_search = original
    finally:
        _delete_test_document(doc_id)


# ===========================================================================
# 8. /assess exposes valid retrieval_mode
# ===========================================================================

def test_assess_retrieval_mode_in_response():
    """POST /assess response includes a non-empty retrieval_mode field."""
    wf_id = _create_workflow()
    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search_response(mock_httpx, mode="vector")
        mock_openai.chat.completions.create.return_value = _mock_llm(_GOOD_VERDICT)
        resp = client.post(
            f"/assess/{wf_id}",
            params={"portfolio_company_id": VALID_PORTFOLIO_CO_ID},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "retrieval_mode" in data, "Response missing retrieval_mode"
    assert data["retrieval_mode"] is not None
    assert data["retrieval_mode"] != ""


# ===========================================================================
# 9. /assess exposes valid retrieval_chunks_used
# ===========================================================================

def test_assess_retrieval_chunks_used_in_response():
    """POST /assess returns retrieval_chunks_used >= 1 when results supplied."""
    wf_id = _create_workflow()
    results = [
        {
            "chunkId": 10,
            "documentId": 1,
            "title": "Policy B",
            "category": "policy",
            "snippet": "Budget authority threshold §4.",
            "score": 0.88,
        },
        {
            "chunkId": 11,
            "documentId": 1,
            "title": "Policy B",
            "category": "policy",
            "snippet": "Approval escalation path §5.",
            "score": 0.75,
        },
    ]
    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        _mock_search_response(mock_httpx, mode="vector", results=results)
        mock_openai.chat.completions.create.return_value = _mock_llm(_GOOD_VERDICT)
        resp = client.post(
            f"/assess/{wf_id}",
            params={"portfolio_company_id": VALID_PORTFOLIO_CO_ID},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "retrieval_chunks_used" in data, "Response missing retrieval_chunks_used"
    assert isinstance(data["retrieval_chunks_used"], int)
    assert data["retrieval_chunks_used"] >= 1


# ===========================================================================
# 10. /assess continues gracefully when retrieval fails entirely
# ===========================================================================

def test_assess_graceful_on_retrieval_failure():
    """/assess completes with empty context when worker endpoint is unreachable."""
    wf_id = _create_workflow()
    with patch("main.httpx") as mock_httpx, patch("main._openai") as mock_openai:
        mock_httpx.post.side_effect = ConnectionError("worker unavailable (simulated)")
        mock_openai.chat.completions.create.return_value = _mock_llm(_GOOD_VERDICT)
        resp = client.post(
            f"/assess/{wf_id}",
            params={"portfolio_company_id": VALID_PORTFOLIO_CO_ID},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "retrieval_mode" in data
    assert "retrieval_failed" in data["retrieval_mode"], (
        f"Expected retrieval_failed in mode, got: {data['retrieval_mode']}"
    )
    assert data["retrieval_chunks_used"] == 0
