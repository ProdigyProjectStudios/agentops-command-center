"""Alembic environment — sync psycopg, scoped exclusively to the agentops_py schema.

Key design choices
------------------
* Uses psycopg (v3 sync) so no greenlet dependency is needed — safe to run
  in the production startup script before the main services start.
* version_table_schema="agentops_py" keeps alembic_version out of public.
* include_name() + include_schemas=True prevents autogenerate from ever
  inspecting or touching anything in the public schema.
* Offline mode uses the plain postgresql:// URL for SQL script output.
"""

from __future__ import annotations

import os
import urllib.parse
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from sqlalchemy.engine import Connection

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

def _build_sync_url() -> str:
    """Return a psycopg (v3 sync) compatible URL.

    Strips sslmode= (not supported as a query param by psycopg3) and
    switches the scheme to postgresql+psycopg so SQLAlchemy uses the
    psycopg3 driver — no greenlet required.
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
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    url = url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def _build_offline_url() -> str:
    """Return a plain postgresql:// URL for offline (SQL-script) mode."""
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
    url = url.replace("postgres://", "postgresql://", 1)
    return url


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
# Online mode (sync psycopg — no greenlet needed)
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, **_ALEMBIC_CTX_OPTS)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        {"sqlalchemy.url": _build_sync_url()},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Ensure the schema exists before Alembic tries to write its
        # version table into it. Safe to run on every startup — no-op
        # if the schema is already there.
        connection.execute(
            text("CREATE SCHEMA IF NOT EXISTS agentops_py")
        )
        connection.commit()
        do_run_migrations(connection)
    connectable.dispose()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
