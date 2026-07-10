"""
Database connection helper.

Uses psycopg (v3) sync — the same library as the existing agent-worker.
Every endpoint opens a short-lived connection and closes it on return;
good enough for a standalone verification service, easy to swap for a
connection pool (psycopg_pool) later without touching any endpoint code.
"""

from __future__ import annotations

import os
import psycopg


def get_conn() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return psycopg.connect(url)
