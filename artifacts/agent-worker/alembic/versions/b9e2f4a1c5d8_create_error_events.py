"""create_error_events

Revision ID: b9e2f4a1c5d8
Revises: 8b8b949048ec
Create Date: 2026-07-13 00:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b9e2f4a1c5d8'
down_revision: Union[str, Sequence[str], None] = '8b8b949048ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'error_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('endpoint', sa.String(length=255), nullable=True),
        sa.Column('error_type', sa.String(length=255), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=False),
        sa.Column('stack_trace', sa.Text(), nullable=True),
        sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        schema='agentops_py',
    )
    op.create_index(
        'ix_agentops_py_error_events_service',
        'error_events', ['service'],
        unique=False, schema='agentops_py',
    )
    op.create_index(
        'ix_agentops_py_error_events_created_at',
        'error_events', ['created_at'],
        unique=False, schema='agentops_py',
    )


def downgrade() -> None:
    op.drop_index('ix_agentops_py_error_events_created_at', table_name='error_events', schema='agentops_py')
    op.drop_index('ix_agentops_py_error_events_service', table_name='error_events', schema='agentops_py')
    op.drop_table('error_events', schema='agentops_py')
