"""Structured JSON logging for agent-worker.

Every record emits a single JSON line to stdout:
  {"ts":"...","service":"agent-worker","level":"INFO","logger":"...","msg":"...",...extra}

Extra fields (job_id, workflow, stage, etc.) are passed via logging's `extra=` kwarg
and merged into the top-level JSON object.

Usage
-----
    from log import setup_logging, get_logger

    setup_logging()                          # call once at module level
    log = get_logger("worker_loop")

    log.info("job completed", extra={"job_id": 7, "workflow": "test", "stage": "run"})
    log.error("claim failed", extra={"job_id": 7}, exc_info=True)
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_SERVICE = "agent-worker"

_STDLIB_ATTRS: frozenset[str] = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime"}


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        doc: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "service": _SERVICE,
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, val in record.__dict__.items():
            if key not in _STDLIB_ATTRS and not key.startswith("_"):
                doc[key] = val
        if record.exc_info and record.exc_info[0] is not None:
            doc["exc"] = self.formatException(record.exc_info)
        return json.dumps(doc, default=str)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure the root logger with the JSON formatter. Call once at startup."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger that inherits the root JSON handler."""
    return logging.getLogger(name)
