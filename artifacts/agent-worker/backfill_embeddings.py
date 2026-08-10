#!/usr/bin/env python3
"""
Backfill pgvector embeddings for memory_chunks rows that have embedding IS NULL.

Usage
-----
    cd artifacts/agent-worker
    uv run python backfill_embeddings.py [--batch-size N] [--dry-run]

Options
-------
    --batch-size N   Rows per commit batch (default 50).
    --dry-run        Count NULL-embedding rows and exit without writing.

The script is idempotent: rows that already have an embedding are
skipped silently.  It is safe to run multiple times or to interrupt
and resume — each batch is committed independently so a restart loses
at most batch_size rows of progress.

Exit code
---------
    0 — all rows processed (or nothing to do)
    1 — one or more rows failed to embed
"""
from __future__ import annotations

import argparse
import os
import sys

# Make the worker package importable when run as a script from any CWD.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import psycopg
from memory_store import backfill_embeddings


def _count_null_embeddings() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM memory_chunks WHERE embedding IS NULL")
        row = cur.fetchone()
        return int(row[0]) if row else 0


def _count_total_chunks() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM memory_chunks")
        row = cur.fetchone()
        return int(row[0]) if row else 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill pgvector embeddings for NULL memory_chunks rows."
    )
    parser.add_argument(
        "--batch-size", type=int, default=50, metavar="N",
        help="Rows per commit batch (default 50)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Count rows that need backfilling and exit without writing",
    )
    args = parser.parse_args()

    total = _count_total_chunks()
    null_before = _count_null_embeddings()
    embedded_before = total - null_before

    print(f"memory_chunks total        : {total}")
    print(f"  already embedded         : {embedded_before}")
    print(f"  embedding IS NULL        : {null_before}")

    if args.dry_run:
        print("\nDry-run mode — no writes performed.")
        return

    if null_before == 0:
        print("\nNothing to do — all chunks already have embeddings.")
        return

    print(f"\nStarting backfill (batch_size={args.batch_size}) …")
    result = backfill_embeddings(batch_size=args.batch_size)

    null_after = _count_null_embeddings()
    print(
        f"\n  processed : {result['processed']}\n"
        f"  skipped   : {result['skipped']}  (already embedded by concurrent run)\n"
        f"  failed    : {result['failed']}\n"
        f"\nNULL embeddings remaining  : {null_after}"
    )

    if result["failed"]:
        print(
            f"\nWARNING: {result['failed']} row(s) failed to embed — check output above.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("\nBackfill complete.")


if __name__ == "__main__":
    main()
