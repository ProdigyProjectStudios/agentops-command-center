"""Embedding service for the AgentOps Python worker (Phase 1C spike).

- Live mode: uses OPENAI_API_KEY with text-embedding-3-small.
- Demo mode: deterministic pseudo-embedding derived from the input text
  so search behavior is reproducible without an API key.
- Never raises to the caller — failures degrade to demo mode and are
  reported in the returned ``mode``/``reason`` fields.
"""

from __future__ import annotations

import hashlib
import math
import os
from dataclasses import dataclass
from typing import Literal

EMBEDDING_DIMENSIONS = 1536
EMBEDDING_MODEL = "text-embedding-3-small"

EmbeddingMode = Literal["live", "demo"]


@dataclass
class EmbeddingResult:
    mode: EmbeddingMode
    vector: list[float]
    dimensions: int
    reason: str | None = None  # populated when mode falls back to demo


def _has_openai_key() -> bool:
    return bool(
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
    )


def _demo_embedding(text: str) -> list[float]:
    """Deterministic pseudo-embedding seeded by SHA-256 of the text.

    The vector is L2-normalized so cosine similarity behaves sensibly
    (identical text → 1.0, totally different text → ~0). This is not a
    semantic embedding — it's just stable enough that the spike's
    search endpoint returns reproducible ordering.
    """
    seed = hashlib.sha256(text.strip().lower().encode("utf-8")).digest()
    # Repeat the 32-byte digest until we have enough material; map each
    # byte to a value in [-1, 1] biased by position so different texts
    # spread across the unit sphere instead of clustering near zero.
    raw: list[float] = []
    digest_index = 0
    for i in range(EMBEDDING_DIMENSIONS):
        if digest_index >= len(seed):
            seed = hashlib.sha256(seed).digest()
            digest_index = 0
        byte = seed[digest_index]
        digest_index += 1
        # spread to [-1, 1]
        raw.append((byte / 127.5) - 1.0 + math.sin(i * 0.013))
    norm = math.sqrt(sum(v * v for v in raw)) or 1.0
    return [v / norm for v in raw]


def _live_embedding(text: str) -> list[float] | None:
    """Try the OpenAI embeddings API. Returns None on any failure."""
    try:
        from openai import OpenAI  # imported lazily so the worker boots without openai
    except Exception:
        return None
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get(
        "AI_INTEGRATIONS_OPENAI_API_KEY"
    )
    if not api_key:
        return None
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") or os.environ.get(
        "OPENAI_BASE_URL"
    )
    try:
        client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(
            api_key=api_key
        )
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
        vec = list(resp.data[0].embedding)
        if len(vec) != EMBEDDING_DIMENSIONS:
            return None
        return vec
    except Exception:
        return None


def embed_text(text: str) -> EmbeddingResult:
    """Return an embedding result, falling back to demo on any failure."""
    text = (text or "").strip()
    if not text:
        return EmbeddingResult(
            mode="demo",
            vector=_demo_embedding(""),
            dimensions=EMBEDDING_DIMENSIONS,
            reason="empty_input",
        )
    if _has_openai_key():
        vec = _live_embedding(text)
        if vec is not None:
            return EmbeddingResult(
                mode="live", vector=vec, dimensions=EMBEDDING_DIMENSIONS
            )
        return EmbeddingResult(
            mode="demo",
            vector=_demo_embedding(text),
            dimensions=EMBEDDING_DIMENSIONS,
            reason="live_call_failed",
        )
    return EmbeddingResult(
        mode="demo",
        vector=_demo_embedding(text),
        dimensions=EMBEDDING_DIMENSIONS,
        reason="no_credentials",
    )
