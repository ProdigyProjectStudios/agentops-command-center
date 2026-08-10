"""enable_pgvector_extension

Revision ID: e1a2b3c4d5f6
Revises: c7f3a2b1d4e5
Create Date: 2026-08-10 00:00:00.000000

Make the pgvector extension explicit and repeatable in the Alembic
migration history.

The ``memory_chunks.embedding vector(1536)`` column already exists in
the public schema (owned by Drizzle/Node).  This migration does not
touch that column — it only records the extension-level dependency so
every environment that runs ``alembic upgrade head`` has pgvector
enabled before any vector column is used.

The upgrade is idempotent (``IF NOT EXISTS``).  The downgrade is a
deliberate no-op: dropping the vector extension is destructive and
would break the existing embedding column; reverting that column is a
separate Drizzle schema concern.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "e1a2b3c4d5f6"
down_revision: Union[str, Sequence[str], None] = "c7f3a2b1d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    # Intentional no-op — dropping the extension would destroy the
    # memory_chunks.embedding column managed by Drizzle.
    pass
