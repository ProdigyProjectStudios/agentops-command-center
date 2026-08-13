"""
Worker ingest endpoint tests — auth, configuration, and concurrency guards.

Tests POST /worker/memory/ingest:
  • WORKER_INGEST_SECRET unset → 503 (endpoint not configured)
  • No X-Worker-Secret header → 403
  • Wrong X-Worker-Secret value → 403
  • Correct secret, no NULL rows → 200 with processed/skipped/failed counts
  • All count fields >= 0
  • Concurrent call while lock held → 409 in-progress response

Run with:
    cd artifacts/agent-worker && uv run --no-sync python -m pytest tests/test_ingest.py -v
"""
from __future__ import annotations

import os
import sys

# Must come before any worker import so module-level env vars are set
_INGEST_SECRET = "test-ingest-secret-do-not-use-in-prod"
os.environ.setdefault("WORKER_INGEST_SECRET", _INGEST_SECRET)

_HERE = os.path.dirname(__file__)
_WORKER_ROOT = os.path.dirname(_HERE)
if _WORKER_ROOT not in sys.path:
    sys.path.insert(0, _WORKER_ROOT)

import app as worker_app_module
from fastapi.testclient import TestClient

# Override the in-process secret to match what tests will send.
# This works because the module is already loaded; tests read _INGEST_SECRET
# from the module, not from os.environ.
worker_app_module._INGEST_SECRET = _INGEST_SECRET

client = TestClient(worker_app_module.app, raise_server_exceptions=False)

_GOOD_HEADERS = {"X-Worker-Secret": _INGEST_SECRET}


# ---------------------------------------------------------------------------
# Configuration tests
# ---------------------------------------------------------------------------

def test_ingest_unconfigured_returns_503():
    """When WORKER_INGEST_SECRET is absent the endpoint returns 503."""
    original = worker_app_module._INGEST_SECRET
    worker_app_module._INGEST_SECRET = None
    try:
        resp = client.post("/worker/memory/ingest", headers=_GOOD_HEADERS)
        assert resp.status_code == 503, (
            f"Expected 503 when secret is unset, got {resp.status_code}: {resp.text}"
        )
        assert "WORKER_INGEST_SECRET" in resp.json().get("detail", ""), (
            "503 detail should mention WORKER_INGEST_SECRET"
        )
    finally:
        worker_app_module._INGEST_SECRET = original


def test_health_reports_ingest_configured():
    """GET /worker/health includes ingest_configured=true when secret is set."""
    resp = client.get("/worker/health")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "ingest_configured" in data, "health response missing ingest_configured field"
    # Our test fixture sets _INGEST_SECRET to a non-None value
    assert data["ingest_configured"] is True


def test_health_reports_ingest_not_configured():
    """GET /worker/health includes ingest_configured=false when secret is absent."""
    original = worker_app_module._INGEST_SECRET
    worker_app_module._INGEST_SECRET = None
    try:
        resp = client.get("/worker/health")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["ingest_configured"] is False
    finally:
        worker_app_module._INGEST_SECRET = original


# ---------------------------------------------------------------------------
# Auth tests
# ---------------------------------------------------------------------------

def test_ingest_no_secret_returns_403():
    """Request without X-Worker-Secret header is rejected with 403."""
    resp = client.post("/worker/memory/ingest")
    assert resp.status_code == 403, resp.text


def test_ingest_wrong_secret_returns_403():
    """Request with an incorrect X-Worker-Secret is rejected with 403."""
    resp = client.post(
        "/worker/memory/ingest",
        headers={"X-Worker-Secret": "wrong-secret-value"},
    )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Successful call tests
# ---------------------------------------------------------------------------

def test_ingest_returns_200_with_correct_secret():
    """Valid secret → 200 with expected JSON shape regardless of DB state."""
    resp = client.post("/worker/memory/ingest", headers=_GOOD_HEADERS)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "ok"
    for key in ("processed", "skipped", "failed"):
        assert key in data, f"Response missing key: {key}"
        assert isinstance(data[key], int), f"{key} should be int, got {type(data[key])}"


def test_ingest_counts_are_non_negative():
    """All count fields must be >= 0."""
    resp = client.post("/worker/memory/ingest", headers=_GOOD_HEADERS)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    for key in ("processed", "skipped", "failed"):
        assert data[key] >= 0, f"{key} should be >= 0, got {data[key]}"


# ---------------------------------------------------------------------------
# Concurrency guard test
# ---------------------------------------------------------------------------

def test_ingest_concurrent_call_returns_409():
    """Second ingest call while lock is held returns 409 conflict."""
    lock = worker_app_module._ingest_lock

    # Acquire the lock manually to simulate an in-progress backfill
    acquired = lock.acquire(blocking=False)
    assert acquired, "Failed to acquire ingest lock for test setup"
    try:
        resp = client.post("/worker/memory/ingest", headers=_GOOD_HEADERS)
        assert resp.status_code == 409, (
            f"Expected 409 when lock is held, got {resp.status_code}: {resp.text}"
        )
    finally:
        lock.release()
