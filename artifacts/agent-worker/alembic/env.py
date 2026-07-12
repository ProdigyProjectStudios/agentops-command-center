"""Alembic environment — async, scoped exclusively to the agentops_py schema.

Key design choices
------------------
* Uses the async engine from db.py so SSL/search_path are configured
  identically to the running application.
* version_table_schema="agentops_py" keeps alembic_version out of public.
* include_name() + include_schemas=True prevents autogenerate from ever
  inspecting or touching anything in the public schema.
* Offline mode builds the psycopg2-compatible URL for SQL script output;
  online mode runs through asyncpg (the application driver).
"""

from __future__ import annotations

import asyncio
import os
import urllib.parse
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ---------------------------------------------------------------------------
# Alembic config + logging
# ---------------------------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Target metadata — ALL agentops_py models must be imported here so that
# autogenerate can see them.
# ---------------------------------------------------------------------------
from models import Base  # noqa: E402  (after sys.path is set by alembic.ini)

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Schema scoping helpers
# ---------------------------------------------------------------------------
_MANAGED_SCHEMA = "agentops_py"


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    """Tell autogenerate to look only inside agentops_py.

    Returning False for any other schema prevents Alembic from ever
    generating DROP or ALTER statements for public schema objects.
    """
    if type_ == "schema":
        return name == _MANAGED_SCHEMA
    return True


_ALEMBIC_CTX_OPTS: dict = dict(
    target_metadata=target_metadata,
    version_table_schema=_MANAGED_SCHEMA,
    include_schemas=True,
    include_name=include_name,
    compare_type=True,
    compare_server_default=True,
)

# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _build_offline_url() -> str:
    """Return a psycopg2-compatible URL for offline (SQL-script) mode.

    asyncpg is not needed offline; we use the plain postgresql:// scheme so
    Alembic can render dialect-correct SQL without a live connection.
    """
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    qs.pop("sslmode", None)
    clean_query = urllib.parse.urlencode(
        {k: v[0] for k, v in qs.items()}, quote_via=urllib.parse.quote
    )
    clean_parsed = parsed._replace(query=clean_query)
    url = urllib.parse.urlunparse(clean_parsed)
    # Normalise scheme (psycopg2 / offline rendering)
    url = url.replace("postgres://", "postgresql://", 1)
    return url


def _build_async_url_for_alembic() -> str:
    """Return an asyncpg-compatible URL for online (live-connection) mode.

    Strips sslmode= and converts the scheme, exactly like db._build_async_url().
    """
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    sslmode_values = qs.pop("sslmode", [])
    sslmode = sslmode_values[0] if sslmode_values else ""
    clean_query = urllib.parse.urlencode(
        {k: v[0] for k, v in qs.items()}, quote_via=urllib.parse.quote
    )
    clean_parsed = parsed._replace(query=clean_query)
    url = urllib.parse.urlunparse(clean_parsed)
    url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url, sslmode


# ---------------------------------------------------------------------------
# Offline mode
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """Render migrations to SQL without a live connection."""
    context.configure(
        url=_build_offline_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_ALEMBIC_CTX_OPTS,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode (async)
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, **_ALEMBIC_CTX_OPTS)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    async_url, sslmode = _build_async_url_for_alembic()

    connect_args: dict = {
        "server_settings": {"search_path": f"{_MANAGED_SCHEMA},public"},
    }
    if sslmode == "disable":
        connect_args["ssl"] = False
    elif sslmode in ("require", "verify-ca", "verify-full"):
        connect_args["ssl"] = True
    # prefer / allow / missing: leave unset (asyncpg default)

    connectable = async_engine_from_config(
        {"sqlalchemy.url": async_url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
