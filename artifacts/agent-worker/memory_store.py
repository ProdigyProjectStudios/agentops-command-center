"""Postgres-backed memory store for the Phase 1C spike.

Talks to the same database the Node API owns (DATABASE_URL). Uses
psycopg with explicit SQL — Drizzle owns the schema, the worker only
reads and writes specific rows. A single sentinel knowledge document
"Phase 1C spike" is created on demand so embed-spike calls have a valid
foreign key without needing the caller to provide one.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any

import psycopg

SPIKE_DOC_TITLE = "Phase 1C spike"
SPIKE_DOC_CATEGORY = "spike"


def _conn() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url)


def _vec_literal(vec: list[float]) -> str:
    """pgvector accepts text input of the form '[1.0, 2.0, ...]'."""
    return "[" + ",".join(f"{v:.7f}" for v in vec) + "]"


def ensure_spike_document() -> int:
    """Return the id of the sentinel spike knowledge document.

    Inserts the document on first call and reuses it thereafter.
    """
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM knowledge_documents WHERE title = %s LIMIT 1",
            (SPIKE_DOC_TITLE,),
        )
        row = cur.fetchone()
        if row:
            return int(row[0])
        cur.execute(
            """
            INSERT INTO knowledge_documents (title, category, summary, content)
            VALUES (
                %s, %s,
                'Sentinel document used by the Phase 1C vector memory spike.',
                'Sentinel document used by the Phase 1C vector memory spike.'
            )
            RETURNING id
            """,
            (SPIKE_DOC_TITLE, SPIKE_DOC_CATEGORY),
        )
        new_row = cur.fetchone()
        if new_row is None:
            raise RuntimeError("Failed to create Phase 1C spike document")
        new_id = int(new_row[0])
        conn.commit()
        return new_id


def store_chunk(document_id: int, content: str, vec: list[float]) -> int:
    """Insert a memory_chunks row with an embedding. Returns row id."""
    tokens = max(1, len(re.findall(r"\w+", content)))
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO memory_chunks (document_id, content, tokens, embedding)
            VALUES (%s, %s, %s, %s::vector)
            RETURNING id
            """,
            (document_id, content, tokens, _vec_literal(vec)),
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Insert returned no row")
        conn.commit()
        return int(row[0])


@dataclass
class MemoryHit:
    chunk_id: int
    document_id: int
    title: str
    category: str
    snippet: str
    score: float


def vector_search(vec: list[float], limit: int = 5) -> list[MemoryHit]:
    """Cosine similarity over chunks that have an embedding. Empty list if none."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT mc.id, mc.document_id, kd.title, kd.category, mc.content,
                   1 - (mc.embedding <=> %s::vector) AS score
            FROM memory_chunks mc
            JOIN knowledge_documents kd ON kd.id = mc.document_id
            WHERE mc.embedding IS NOT NULL
            ORDER BY mc.embedding <=> %s::vector
            LIMIT %s
            """,
            (_vec_literal(vec), _vec_literal(vec), limit),
        )
        rows = cur.fetchall()
    return [
        MemoryHit(
            chunk_id=int(r[0]),
            document_id=int(r[1]),
            title=str(r[2]),
            category=str(r[3]),
            snippet=_snippet(str(r[4])),
            score=float(r[5]),
        )
        for r in rows
    ]


_STOP = {
    "the", "and", "for", "with", "that", "this", "from", "into", "are", "was",
    "have", "has", "will", "would", "our", "your", "their", "you", "they",
    "them", "what", "when", "where", "which", "but", "not", "need", "needs",
    "please", "want", "about", "also", "each", "more", "most", "some", "such",
    "than", "then", "there", "these", "those", "very", "just", "only", "over",
    "under",
}


def _tokenize(text: str) -> list[str]:
    seen: list[str] = []
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        if len(word) > 3 and word not in _STOP and word not in seen:
            seen.append(word)
        if len(seen) >= 12:
            break
    return seen


def keyword_search(query: str, limit: int = 5) -> list[MemoryHit]:
    """Fallback: ILIKE-based search across knowledge documents + chunks."""
    tokens = _tokenize(query)
    if not tokens:
        return []
    patterns = [f"%{t}%" for t in tokens]
    placeholders = " OR ".join(["mc.content ILIKE %s"] * len(tokens))
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT mc.id, mc.document_id, kd.title, kd.category, mc.content
            FROM memory_chunks mc
            JOIN knowledge_documents kd ON kd.id = mc.document_id
            WHERE {placeholders}
            LIMIT %s
            """,
            (*patterns, limit),
        )
        rows = cur.fetchall()
    hits: list[MemoryHit] = []
    for r in rows:
        content = str(r[4]).lower()
        score = sum(1 for t in tokens if t in content) / max(1, len(tokens))
        hits.append(
            MemoryHit(
                chunk_id=int(r[0]),
                document_id=int(r[1]),
                title=str(r[2]),
                category=str(r[3]),
                snippet=_snippet(str(r[4])),
                score=score,
            )
        )
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits


def _snippet(content: str, max_len: int = 220) -> str:
    s = re.sub(r"\s+", " ", content).strip()
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


def hit_to_dict(hit: MemoryHit) -> dict[str, Any]:
    return {
        "chunkId": hit.chunk_id,
        "documentId": hit.document_id,
        "title": hit.title,
        "category": hit.category,
        "snippet": hit.snippet,
        "score": round(hit.score, 4),
    }
