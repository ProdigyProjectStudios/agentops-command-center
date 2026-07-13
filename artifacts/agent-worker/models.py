"""SQLAlchemy 2 ORM models for the agentops_py schema.

All tables declare ``schema="agentops_py"`` explicitly so Alembic and
the async engine never write into the public schema by accident.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

SCHEMA = "agentops_py"

JobStatus = Enum(
    "queued", "running", "completed", "failed",
    name="job_status",
    schema=SCHEMA,
    create_constraint=True,
)

RunOutcome = Enum(
    "success", "failure", "cancelled", "timeout",
    name="run_outcome",
    schema=SCHEMA,
    create_constraint=True,
)


class Base(DeclarativeBase):
    pass


class Job(Base):
    """A unit of work dispatched through the agent pipeline.

    One Job maps to a (workflow, stage) pair and tracks its lifecycle
    through the scheduler: queued → running → completed | failed.
    Retry state (attempt_count, next_retry_at, last_error) is kept here
    so the scheduler can drive back-off without external state.
    """

    __tablename__ = "jobs"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow: Mapped[str] = mapped_column(String(255), nullable=False)
    stage: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(JobStatus, nullable=False, default="queued")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_retry_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    runs: Mapped[list[AgentRun]] = relationship(
        "AgentRun", back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Job id={self.id} workflow={self.workflow!r} "
            f"stage={self.stage!r} status={self.status!r}>"
        )


class AgentRun(Base):
    """One execution attempt for a Job.

    Each time the worker picks up a Job it creates an AgentRun so we have
    a full audit trail of every attempt, not just the latest.
    """

    __tablename__ = "agent_runs"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{SCHEMA}.jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_ref: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True,
        comment="Opaque external run identifier (e.g. LangGraph thread_id)",
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    outcome: Mapped[str | None] = mapped_column(RunOutcome, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    job: Mapped[Job] = relationship("Job", back_populates="runs")

    def __repr__(self) -> str:
        return (
            f"<AgentRun id={self.id} job_id={self.job_id} "
            f"outcome={self.outcome!r}>"
        )


class Assessment(Base):
    """RAG-backed assessment verdict produced by POST /api-python/assess/{workflow_id}.

    Stores the full LLM verdict (recommendation, confidence, risks,
    evidence_refs, next_actions) alongside routing metadata so every
    decision is auditable.  workflow_run_id is a plain integer reference
    to public.workflow_runs — cross-schema FK is valid in Postgres.
    approval_request_id is populated when confidence < threshold and the
    workflow is routed into the human-approval gate.
    """

    __tablename__ = "assessments"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_run_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    risks: Mapped[list] = mapped_column(JSON, nullable=False)
    evidence_refs: Mapped[list] = mapped_column(JSON, nullable=False)
    next_actions: Mapped[list] = mapped_column(JSON, nullable=False)
    retrieval_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    retrieval_query: Mapped[str | None] = mapped_column(Text, nullable=True)
    routing: Mapped[str] = mapped_column(String(50), nullable=False)
    approval_request_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<Assessment id={self.id} workflow_run_id={self.workflow_run_id} "
            f"confidence={self.confidence:.2f} routing={self.routing!r}>"
        )


class ErrorEvent(Base):
    """Unhandled exception captured by the centralized exception handler.

    Written by both api-python (service='api-python') and
    agent-worker (service='agent-worker') so a single table
    covers the whole Python tier.  The context JSONB column
    carries per-request fields (method, path_params, job_id, etc.)
    that would otherwise be lost.
    """

    __tablename__ = "error_events"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service: Mapped[str] = mapped_column(String(100), nullable=False)
    endpoint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_type: Mapped[str] = mapped_column(String(255), nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=False)
    stack_trace: Mapped[str | None] = mapped_column(Text, nullable=True)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<ErrorEvent id={self.id} service={self.service!r} "
            f"error_type={self.error_type!r}>"
        )
