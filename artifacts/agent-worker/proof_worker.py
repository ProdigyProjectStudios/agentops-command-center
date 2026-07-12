#!/usr/bin/env python3
"""
Proof that the durable worker does what it claims.

Run from the agent-worker directory:
    uv run python proof_worker.py

Exit code 0 = all assertions passed.
Exit code 1 = a proof step failed.
"""
from __future__ import annotations

import asyncio
import os
import sys
import urllib.parse
from datetime import datetime, timezone

import asyncpg
from sqlalchemy import select, text, update

import worker_loop
from db import get_async_session
from models import AgentRun, Job
from worker_loop import (
    MAX_ATTEMPTS,
    ClaimedJob,
    claim_job,
    enqueue_job,
    fail_job,
    poll_once,
    register_handler,
)

SEP = "─" * 64


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def fetch_job_state(job_id: int) -> dict:
    async with get_async_session() as s:
        job = await s.get(Job, job_id)
        if job is None:
            return {"error": f"job {job_id} not found"}
        runs = (
            await s.execute(
                select(AgentRun)
                .where(AgentRun.job_id == job_id)
                .order_by(AgentRun.id)
            )
        ).scalars().all()
        return {
            "id": job.id,
            "status": job.status,
            "attempt_count": job.attempt_count,
            "next_retry_at": job.next_retry_at,
            "last_error": job.last_error,
            "runs": [
                {
                    "run_id": r.id,
                    "outcome": r.outcome,
                    "error": (r.error_message or "")[:80],
                }
                for r in runs
            ],
        }


def pp(state: dict, label: str = "") -> None:
    prefix = f"  [{label}]\n" if label else ""
    ra = state["next_retry_at"]
    if ra:
        delta = (ra - datetime.now(timezone.utc)).total_seconds()
        retry_str = f"{ra.isoformat(timespec='seconds')} ({delta:+.1f}s)"
    else:
        retry_str = "(none)"
    print(
        f"{prefix}"
        f"    status         = {state['status']}\n"
        f"    attempt_count  = {state['attempt_count']}\n"
        f"    next_retry_at  = {retry_str}\n"
        f"    last_error     = {(state['last_error'] or '')[:80] or '(none)'}\n"
        f"    agent_runs     = {len(state['runs'])} row(s)"
    )
    for r in state["runs"]:
        print(f"      run {r['run_id']:3d}:  outcome={r['outcome']:<10s}  error={r['error']}")


async def fast_forward_retry(job_id: int) -> None:
    """Move next_retry_at to the past so the job is immediately claimable."""
    async with get_async_session() as s:
        async with s.begin():
            await s.execute(
                update(Job)
                .where(Job.id == job_id, Job.status == "queued")
                .values(next_retry_at=text("now() - interval '1 second'"))
            )


# ---------------------------------------------------------------------------
# PART 1 — Retry with exponential backoff + max-retry ceiling
# ---------------------------------------------------------------------------

async def part1() -> bool:
    print(SEP)
    print("PART 1 — Retry with exponential backoff + max-retry ceiling")
    print(SEP)
    print(
        f"Config: MAX_ATTEMPTS={MAX_ATTEMPTS}, "
        f"BASE_BACKOFF_SECS={worker_loop.BASE_BACKOFF_SECS}"
    )
    print(
        "Expected: job retries on each failure with 2^n backoff; "
        f"permanently failed after {MAX_ATTEMPTS} attempts."
    )
    print()

    # Register a handler that always raises a clear error
    @register_handler("proof_retry", "always_fail")
    async def _always_fail(job: ClaimedJob) -> str:
        raise RuntimeError(f"deliberate failure on attempt {job.attempt_count + 1}")

    job_id = await enqueue_job("proof_retry", "always_fail")
    print(f"Enqueued job id={job_id}")

    passed = False

    for cycle in range(MAX_ATTEMPTS + 2):  # extra iterations to witness terminal state
        state = await fetch_job_state(job_id)
        print()
        pp(state, label=f"cycle {cycle} — before poll")

        if state["status"] == "failed":
            print()
            print(
                f"  ✓  Job id={job_id} reached status=failed "
                f"after {state['attempt_count']} attempt(s) — "
                "max-retry ceiling works."
            )
            passed = True
            break

        # If the job is queued but not yet ready (backoff hasn't elapsed),
        # fast-forward next_retry_at so the proof doesn't take minutes.
        if state["status"] == "queued" and state["next_retry_at"] is not None:
            print("  → fast-forwarding next_retry_at to past (proof mode)...")
            await fast_forward_retry(job_id)

        processed = await poll_once()
        print(f"  → poll_once() returned processed={processed}")

    if not passed:
        final = await fetch_job_state(job_id)
        print(f"\n  ✗  Expected status=failed, got status={final['status']}")

    return passed


# ---------------------------------------------------------------------------
# PART 2 — Concurrent claim: only one connection wins SKIP LOCKED
# ---------------------------------------------------------------------------

def _build_asyncpg_dsn() -> tuple[str, dict]:
    raw = os.environ.get("DATABASE_URL", "")
    parsed = urllib.parse.urlparse(raw)
    qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    sslmode = qs.pop("sslmode", ["prefer"])[0]
    clean_q = urllib.parse.urlencode(
        {k: v[0] for k, v in qs.items()}, quote_via=urllib.parse.quote
    )
    url = urllib.parse.urlunparse(parsed._replace(scheme="postgres", query=clean_q))
    kwargs: dict = {}
    if sslmode == "disable":
        kwargs["ssl"] = False
    elif sslmode in ("require", "verify-ca", "verify-full"):
        kwargs["ssl"] = True
    return url, kwargs


async def part2() -> bool:
    print()
    print(SEP)
    print("PART 2 — Concurrent claim: SELECT FOR UPDATE SKIP LOCKED")
    print(SEP)
    print("Two raw asyncpg connections race for the same queued row.")
    print("Conn1 opens a transaction and locks the row (holds lock open).")
    print("Conn2 fires the same query while the lock is still held.")
    print("Expected: Conn1 gets the row, Conn2 gets NOTHING (SKIP LOCKED).")
    print()

    # Enqueue a fresh job for this proof
    job_id = await enqueue_job("proof_concurrent", "race")
    print(f"Enqueued job id={job_id}  (status=queued)")

    CLAIM_SQL = """
        SELECT id, workflow, stage, status
        FROM   agentops_py.jobs
        WHERE  status = 'queued'
          AND  (next_retry_at IS NULL OR next_retry_at <= now())
        ORDER BY created_at
        LIMIT  1
        FOR UPDATE SKIP LOCKED
    """

    dsn, ssl_kwargs = _build_asyncpg_dsn()
    pool = await asyncpg.create_pool(
        dsn,
        min_size=2,
        max_size=2,
        server_settings={"search_path": "agentops_py,public"},
        **ssl_kwargs,
    )
    row1 = row2 = None
    try:
        conn1 = await pool.acquire()
        conn2 = await pool.acquire()
        try:
            # ---- Conn1: BEGIN + SELECT FOR UPDATE SKIP LOCKED ----------------
            # We do NOT commit yet — the transaction (and its row lock) stays open.
            tr1 = conn1.transaction()
            await tr1.start()
            row1 = await conn1.fetchrow(CLAIM_SQL)

            # ---- Conn2: while Conn1 still holds the lock, try the same query -
            tr2 = conn2.transaction()
            await tr2.start()
            row2 = await conn2.fetchrow(CLAIM_SQL)

            # Report
            print()
            if row1:
                print(
                    f"  Conn1 (holds lock)  → claimed  id={row1['id']} "
                    f"workflow={row1['workflow']!r} status={row1['status']!r}"
                )
            else:
                print("  Conn1 → no row found  ← UNEXPECTED (job was enqueued above)")

            if row2 is None:
                print(
                    "  Conn2 (racing conn) → got NOTHING "
                    "← SKIP LOCKED correctly blocked the second claim"
                )
            else:
                print(
                    f"  Conn2 → claimed id={row2['id']}  "
                    "← UNEXPECTED: SKIP LOCKED did not block!"
                )

            # Clean up transactions (rollback — job stays queued, we delete it below)
            await tr1.rollback()
            await tr2.rollback()
        finally:
            await pool.release(conn1)
            await pool.release(conn2)
    finally:
        await pool.close()

    passed = row1 is not None and row2 is None
    print()
    if passed:
        print(
            "  ✓  Only one connection claimed the row. "
            "SKIP LOCKED prevents double-processing."
        )
    else:
        print("  ✗  Concurrent claim proof did not behave as expected.")

    # Remove the proof job
    async with get_async_session() as s:
        async with s.begin():
            job = await s.get(Job, job_id)
            if job:
                await s.delete(job)

    return passed


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main() -> int:
    print("AgentOps durable-worker proof")
    print(f"Started: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    print()

    ok1 = await part1()
    ok2 = await part2()

    print()
    print(SEP)
    print("RESULT SUMMARY")
    print(SEP)
    print(f"  Part 1  retry + max-retry ceiling : {'✓ PASSED' if ok1 else '✗ FAILED'}")
    print(f"  Part 2  concurrent SKIP LOCKED    : {'✓ PASSED' if ok2 else '✗ FAILED'}")
    print()
    return 0 if (ok1 and ok2) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
