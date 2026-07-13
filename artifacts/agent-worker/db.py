"""SQLAlchemy 2 async engine scoped to the agentops_py schema.

This module is additive — it sits alongside the existing psycopg3 sync
helpers in memory_store.py and does not replace them.  The psycopg3
paths (store_chunk, vector_search, etc.) remain the active data path;
this engine is the foundation for Python-owned tables that will live
in the agentops_py schema.

Usage
-----
    from db import get_async_session, check_connection, verify_schema

    # On startup
    await verify_schema()   # confirms agentops_py exists in information_schema
    await check_connection() # confirms current_schema=agentops_py via search_path

    # Session-scoped work
    async with get_async_session() as session:
        await session.execute(text("SELECT 1"))
"""

from __future__ import annotations

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

from log import get_logger

logger = get_logger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_async_url() -> tuple[str, dict]:
    """Convert DATABASE_URL to asyncpg-compatible URL + connect_args.

    asyncpg does not accept ``sslmode=`` as a URL query parameter (that is
    libpq/psycopg syntax).  We strip it from the URL and translate it to
    asyncpg's ``ssl`` connect arg:

    * ``disable``             → ssl=False   (explicit plaintext)
    * ``require``             → ssl=True    (TLS required, no cert verification)
    * ``verify-ca``           → ssl=True    (TLS + CA verification)
    * ``verify-full``         → ssl=True    (TLS + hostname verification)
    * ``prefer`` / ``allow``  → *unset*     (asyncpg default; attempt TLS, fall
                                             back gracefully — matches libpq semantics)
    * *missing*               → *unset*     (asyncpg default)

    Leaving ssl unset for prefer/allow/missing preserves asyncpg's built-in
    negotiation behaviour and avoids silently downgrading encrypted transport.
    """
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

    # Extract and remove sslmode so asyncpg never sees it as a URL param
    sslmode_values = qs.pop("sslmode", [])
    sslmode = sslmode_values[0] if sslmode_values else ""

    # Rebuild query string without sslmode
    clean_query = urllib.parse.urlencode(
        {k: v[0] for k, v in qs.items()}, quote_via=urllib.parse.quote
    )
    clean_parsed = parsed._replace(query=clean_query)
    clean_url = urllib.parse.urlunparse(clean_parsed)

    # Convert scheme to asyncpg driver
    clean_url = clean_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    clean_url = clean_url.replace("postgres://", "postgresql+asyncpg://", 1)

    connect_args: dict = {
        "server_settings": {
            "search_path": "agentops_py,public",
        },
    }

    # Only set ssl when the value is explicit and unambiguous.
    # For prefer/allow/missing we leave ssl unset to preserve asyncpg defaults.
    if sslmode == "disable":
        connect_args["ssl"] = False
    elif sslmode in ("require", "verify-ca", "verify-full"):
        connect_args["ssl"] = True
    # prefer / allow / missing: leave ssl unset (asyncpg negotiates)

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


async def verify_schema() -> dict[str, str]:
    """Confirm that the agentops_py schema exists in information_schema.schemata.

    This provides an auditable, in-process record that the schema was present
    at worker startup.  It does NOT attempt DDL — schema creation is a deliberate
    ops step so we do not silently create it here.

    Returns a dict with:
      schema_name  — the schema name found (or empty string if absent)
      owner        — schema owner (catalog_name from information_schema)
      status       — "ok" | "missing" | "error"
      error        — error message (only present when status == "error")
    """
    try:
        async with get_async_session() as session:
            row = (
                await session.execute(
                    text(
                        "SELECT schema_name, catalog_name "
                        "FROM information_schema.schemata "
                        "WHERE schema_name = 'agentops_py'"
                    )
                )
            ).one_or_none()
        if row is None:
            return {
                "status": "missing",
                "schema_name": "",
                "owner": "",
            }
        return {
            "status": "ok",
            "schema_name": row[0],
            "owner": row[1],
        }
    except Exception as exc:
        logger.error("schema verification failed", extra={"error": str(exc)})
        return {
            "status": "error",
            "schema_name": "",
            "owner": "",
            "error": str(exc),
        }


async def check_connection() -> dict[str, str]:
    """Run a trivial query to confirm the engine reaches the DB and that
    search_path puts agentops_py first.

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
        logger.error("async db check failed", extra={"error": str(exc)})
        return {
            "status": "error",
            "current_schema": "unknown",
            "pg_version": "unknown",
            "error": str(exc),
        }
