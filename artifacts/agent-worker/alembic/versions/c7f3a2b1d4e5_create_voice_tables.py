"""create_voice_tables

Revision ID: c7f3a2b1d4e5
Revises: b9e2f4a1c5d8
Create Date: 2026-07-13 04:00:00.000000

voice_calls      — one row per inbound Twilio call (audit anchor)
voice_call_events — append-only event log keyed to voice_calls.id
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c7f3a2b1d4e5"
down_revision: Union[str, Sequence[str], None] = "b9e2f4a1c5d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voice_calls",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("twilio_call_sid", sa.String(length=64), nullable=False),
        sa.Column("from_number", sa.String(length=32), nullable=False),
        sa.Column("to_number", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ringing"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("twilio_call_sid"),
        schema="agentops_py",
    )
    op.create_index(
        "ix_agentops_py_voice_calls_twilio_call_sid",
        "voice_calls",
        ["twilio_call_sid"],
        unique=True,
        schema="agentops_py",
    )

    op.create_table(
        "voice_call_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("call_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "detail",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["call_id"],
            ["agentops_py.voice_calls.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="agentops_py",
    )
    op.create_index(
        "ix_agentops_py_voice_call_events_call_id",
        "voice_call_events",
        ["call_id"],
        unique=False,
        schema="agentops_py",
    )
    op.create_index(
        "ix_agentops_py_voice_call_events_event_type",
        "voice_call_events",
        ["event_type"],
        unique=False,
        schema="agentops_py",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_agentops_py_voice_call_events_event_type",
        table_name="voice_call_events",
        schema="agentops_py",
    )
    op.drop_index(
        "ix_agentops_py_voice_call_events_call_id",
        table_name="voice_call_events",
        schema="agentops_py",
    )
    op.drop_table("voice_call_events", schema="agentops_py")
    op.drop_index(
        "ix_agentops_py_voice_calls_twilio_call_sid",
        table_name="voice_calls",
        schema="agentops_py",
    )
    op.drop_table("voice_calls", schema="agentops_py")
