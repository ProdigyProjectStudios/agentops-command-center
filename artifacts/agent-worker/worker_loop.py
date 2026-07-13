"""Durable async job worker for agentops_py.

Claim strategy
--------------
SELECT ... FOR UPDATE SKIP LOCKED claims exactly one queued job per worker
iteration.  Two concurrent workers racing for the same row will both see
it in the initial WHERE scan but Postgres grants the lock to only one;
the other immediately skips it (SKIP LOCKED) and returns nothing.  The
winning worker sets status=running and commits, so the row is invisible
to future polls until it transitions back to queued (retry) or reaches
a terminal state (completed / failed).

Retry policy
------------
On failure:
  attempt_count  += 1
  if attempt_count >= MAX_ATTEMPTS → status = "failed"  (terminal)
  else                              → status = "queued"
                                     next_retry_at = now() + BASE_BACKOFF_SECS ** attempt_count

  attempt 1: 2 ** 1 =  2 s
  attempt 2: 2 ** 2 =  4 s
  attempt 3: 2 ** 3 =  8 s
  attempt 4: MAX_ATTEMPTS reached → failed
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_async_session
from log import get_logger
from models import AgentRun, Job

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_ATTEMPTS: int = 4        # job is permanently failed after this many failures
BASE_BACKOFF_SECS: int = 2   # retry delay = BASE_BACKOFF_SECS ** attempt_count
POLL_INTERVAL_SECS: float = 2.0


# ---------------------------------------------------------------------------
# Handler registry
# ---------------------------------------------------------------------------

JobHandler = Callable[["ClaimedJob"], Awaitable[str]]
_handlers: dict[str, JobHandler] = {}


def register_handler(workflow: str, stage: str = "*") -> Callable[[JobHandler], JobHandler]:
    """Decorator: register an async handler for a workflow:stage pair.

    A stage of ``"*"`` acts as a wildcard that matches any stage for
    the given workflow when no exact match exists.

    Example::

        @register_handler("my_workflow", "process")
        async def handle_process(job: ClaimedJob) -> str:
            return "done"
    """
    key = f"{workflow}:{stage}"

    def decorator(fn: JobHandler) -> JobHandler:
        _handlers[key] = fn
        return fn

    return decorator


def get_handler(workflow: str, stage: str) -> JobHandler | None:
    return _handlers.get(f"{workflow}:{stage}") or _handlers.get(f"{workflow}:*")


# ---------------------------------------------------------------------------
# ClaimedJob — plain snapshot returned by claim_job()
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ClaimedJob:
    job_id: int
    run_id: int
    workflow: str
    stage: str
    attempt_count: int  # value at the time of claim (before any failure increment)


# ---------------------------------------------------------------------------
# Core operations — each uses its own short-lived transaction
# ---------------------------------------------------------------------------

async def enqueue_job(workflow: str, stage: str) -> int:
    """Insert a new job with status=queued.  Returns the new job id."""
    async with get_async_session() as session:
        async with session.begin():
            job = Job(
                workflow=workflow,
                stage=stage,
                status="queued",
                attempt_count=0,
            )
            session.add(job)
            await session.flush()
            return job.id


async def claim_job() -> ClaimedJob | None:
    """Atomically claim one queued job using SELECT FOR UPDATE SKIP LOCKED.

    The transaction commits immediately after setting status=running so the
    row lock is held for the minimum possible time.  The handler then
    executes outside any transaction.

    Returns None when there are no claimable jobs right now.
    """
    now = datetime.now(timezone.utc)
    async with get_async_session() as session:
        async with session.begin():
            stmt = (
                select(Job)
                .where(
                    Job.status == "queued",
                    or_(Job.next_retry_at.is_(None), Job.next_retry_at <= now),
                )
                .order_by(Job.created_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            job = (await session.execute(stmt)).scalar_one_or_none()
            if job is None:
                return None

            job.status = "running"
            job.updated_at = now
            run = AgentRun(job_id=job.id, started_at=now)
            session.add(run)
            await session.flush()  # populate run.id before commit

            return ClaimedJob(
                job_id=job.id,
                run_id=run.id,
                workflow=job.workflow,
                stage=job.stage,
                attempt_count=job.attempt_count,
            )
            # session.begin() commits here


async def complete_job(job_id: int, run_id: int, result: str) -> None:
    """Mark job completed and the associated run successful."""
    now = datetime.now(timezone.utc)
    async with get_async_session() as session:
        async with session.begin():
            job = await session.get(Job, job_id)
            run = await session.get(AgentRun, run_id)
            if job:
                job.status = "completed"
                job.updated_at = now
            if run:
                run.outcome = "success"
                run.finished_at = now


async def fail_job(job_id: int, run_id: int, error: str) -> None:
    """Record a failure and either schedule a retry or mark the job permanently failed.

    Retry schedule:
      next_retry_at = now() + BASE_BACKOFF_SECS ** attempt_count
    where attempt_count is the NEW value after incrementing.
    """
    now = datetime.now(timezone.utc)
    async with get_async_session() as session:
        async with session.begin():
            job = await session.get(Job, job_id)
            run = await session.get(AgentRun, run_id)
            if job:
                job.attempt_count += 1
                job.last_error = error[:4000]
                job.updated_at = now

                if job.attempt_count >= MAX_ATTEMPTS:
                    job.status = "failed"
                    logger.warning(
                        "job permanently failed",
                        extra={
                            "job_id": job_id,
                            "attempt_count": job.attempt_count,
                            "error": error[:200],
                        },
                    )
                else:
                    backoff_secs = BASE_BACKOFF_SECS ** job.attempt_count
                    job.status = "queued"
                    job.next_retry_at = now + timedelta(seconds=backoff_secs)
                    logger.info(
                        "job failed, retrying",
                        extra={
                            "job_id": job_id,
                            "attempt": job.attempt_count,
                            "max_attempts": MAX_ATTEMPTS - 1,
                            "backoff_secs": backoff_secs,
                            "error": error[:200],
                        },
                    )
            if run:
                run.outcome = "failure"
                run.error_message = error[:4000]
                run.finished_at = now


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------

async def poll_once() -> bool:
    """Claim and process one job.  Returns True if a job was processed."""
    claimed = await claim_job()
    if claimed is None:
        return False

    handler = get_handler(claimed.workflow, claimed.stage)
    if handler is None:
        err = f"No handler registered for {claimed.workflow}:{claimed.stage}"
        logger.error(
            "no handler for job",
            extra={"job_id": claimed.job_id, "workflow": claimed.workflow, "stage": claimed.stage},
        )
        await fail_job(claimed.job_id, claimed.run_id, err)
        return True

    try:
        result = await handler(claimed)
        await complete_job(claimed.job_id, claimed.run_id, result)
        logger.info(
            "job completed",
            extra={
                "job_id": claimed.job_id,
                "workflow": claimed.workflow,
                "stage": claimed.stage,
                "result": result[:200],
            },
        )
    except Exception as exc:
        await fail_job(claimed.job_id, claimed.run_id, str(exc))

    return True


_worker_task: asyncio.Task | None = None


async def run_worker_loop() -> None:
    """Continuously poll agentops_py.jobs.  Cancel to stop gracefully."""
    logger.info(
        "worker loop started",
        extra={
            "max_attempts": MAX_ATTEMPTS,
            "base_backoff_secs": BASE_BACKOFF_SECS,
            "poll_interval_secs": POLL_INTERVAL_SECS,
        },
    )
    try:
        while True:
            try:
                processed = await poll_once()
            except Exception as exc:
                logger.error("unexpected error in poll_once", extra={"error": str(exc)}, exc_info=True)
                processed = False
            if not processed:
                await asyncio.sleep(POLL_INTERVAL_SECS)
    except asyncio.CancelledError:
        logger.info("worker loop cancelled")
        raise


def start_worker_background(loop: asyncio.AbstractEventLoop | None = None) -> asyncio.Task:
    """Schedule run_worker_loop() as a background asyncio Task."""
    global _worker_task
    _worker_task = asyncio.ensure_future(run_worker_loop())
    return _worker_task


def stop_worker_background() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        _worker_task = None
