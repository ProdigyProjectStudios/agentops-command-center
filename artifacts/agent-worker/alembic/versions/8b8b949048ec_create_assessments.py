"""create_assessments

Revision ID: 8b8b949048ec
Revises: 9ce2a95ea123
Create Date: 2026-07-12 22:54:45.213785

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8b8b949048ec'
down_revision: Union[str, Sequence[str], None] = '9ce2a95ea123'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'assessments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workflow_run_id', sa.Integer(), nullable=False),
        sa.Column('recommendation', sa.Text(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('risks', sa.JSON(), nullable=False),
        sa.Column('evidence_refs', sa.JSON(), nullable=False),
        sa.Column('next_actions', sa.JSON(), nullable=False),
        sa.Column('retrieval_mode', sa.String(length=50), nullable=True),
        sa.Column('retrieval_query', sa.Text(), nullable=True),
        sa.Column('routing', sa.String(length=50), nullable=False),
        sa.Column('approval_request_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='agentops_py',
    )
    op.create_index(
        op.f('ix_agentops_py_assessments_workflow_run_id'),
        'assessments', ['workflow_run_id'],
        unique=False, schema='agentops_py',
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_agentops_py_assessments_workflow_run_id'), table_name='assessments', schema='agentops_py')
    op.drop_table('assessments', schema='agentops_py')
