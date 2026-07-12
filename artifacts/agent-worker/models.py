"""SQLAlchemy 2 ORM models for the agentops_py schema.

All tables declare ``schema="agentops_py"`` explicitly so Alembic and
the async engine never write into the public schema by accident.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
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
