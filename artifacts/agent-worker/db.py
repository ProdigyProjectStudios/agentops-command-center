"""SQLAlchemy 2 async engine scoped to the agentops_py schema.

This module is additive — it sits alongside the existing psycopg3 sync
helpers in memory_store.py and does not replace them.  The psycopg3
paths (store_chunk, vector_search, etc.) remain the active data path;
this engine is the foundation for Python-owned tables that will live
in the agentops_py schema.

Usage
-----
    from db import get_async_session, check_connection

    # One-off query
    result = await check_connection()

    # Session-scoped work
    async with get_async_session() as session:
        await session.execute(text("SELECT 1"))
"""

from __future__ import annotations

import logging
import os
import urllib.parse
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None

_SSLMODE_TO_BOOL: dict[str, bool | None] = {
    "disable": False,
    "allow": False,
    "prefer": False,
    "require": True,
    "verify-ca": True,
    "verify-full": True,
}


def _build_async_url() -> tuple[str, dict]:
    """Convert DATABASE_URL to asyncpg-compatible URL + connect_args.

    asyncpg does not accept sslmode= as a query parameter; it uses a
    boolean ssl= connect arg instead.  We strip sslmode from the URL
    and translate it here.
    """
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

    # Extract and remove sslmode
    sslmode_values = qs.pop("sslmode", [])
    sslmode = sslmode_values[0] if sslmode_values else "prefer"

    # Rebuild query string without sslmode
    clean_query = urllib.parse.urlencode(
        {k: v[0] for k, v in qs.items()}, quote_via=urllib.parse.quote
    )
    clean_parsed = parsed._replace(query=clean_query)
    clean_url = urllib.parse.urlunparse(clean_parsed)

    # Convert scheme to asyncpg driver
    clean_url = clean_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    clean_url = clean_url.replace("postgres://", "postgresql+asyncpg://", 1)

    ssl_value = _SSLMODE_TO_BOOL.get(sslmode, False)

    connect_args: dict = {
        "server_settings": {
            "search_path": "agentops_py,public",
        },
    }
    if ssl_value is not None:
        connect_args["ssl"] = ssl_value

    return clean_url, connect_args


def get_engine() -> AsyncEngine:
    """Return (or lazily create) the shared async engine."""
    global _engine
    if _engine is None:
        url, connect_args = _build_async_url()
        _engine = create_async_engine(
            url,
            echo=False,
            pool_size=5,
            max_overflow=10,
            connect_args=connect_args,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return (or lazily create) the shared session factory."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(),
            expire_on_commit=False,
            class_=AsyncSession,
        )
    return _session_factory


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager that yields a session and closes it on exit."""
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def check_connection() -> dict[str, str]:
    """Run a trivial query to confirm the engine reaches the DB.

    Returns a dict with:
      current_schema  — should be "agentops_py" (first in search_path)
      pg_version      — short Postgres version string
      status          — "ok" or "error"
      error           — error message (only present when status == "error")
    """
    try:
        async with get_async_session() as session:
            row = (
                await session.execute(
                    text("SELECT current_schema(), version()")
                )
            ).one()
            schema: str = row[0]
            version_full: str = row[1]
            pg_version = version_full.split(",")[0].strip()
        return {
            "status": "ok",
            "current_schema": schema,
            "pg_version": pg_version,
        }
    except Exception as exc:
        logger.error("agentops_py async DB check failed: %s", exc)
        return {
            "status": "error",
            "current_schema": "unknown",
            "pg_version": "unknown",
            "error": str(exc),
        }
