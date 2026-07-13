"""Structured JSON logging for api-python.

Every record emits a single JSON line to stdout:
  {"ts":"...","service":"api-python","level":"INFO","logger":"...","msg":"...",...extra}

Extra fields (workflow_id, endpoint, etc.) are passed via logging's `extra=` kwarg
and merged into the top-level JSON object — not nested.

Usage
-----
    from log import setup_logging, get_logger

    setup_logging()                           # call once at module level
    log = get_logger("api-python")

    log.info("assessment stored", extra={"workflow_id": 15, "confidence": 0.93})
    log.error("db write failed", extra={"table": "error_events"}, exc_info=True)
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_SERVICE = "api-python"

# Attributes that belong to LogRecord itself — anything else is "extra" context.
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
        # Merge caller-supplied extra= fields into the top level.
        for key, val in record.__dict__.items():
            if key not in _STDLIB_ATTRS and not key.startswith("_"):
                doc[key] = val
        if record.exc_info and record.exc_info[0] is not None:
            doc["exc"] = self.formatException(record.exc_info)
        return json.dumps(doc, default=str)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure the root logger with the JSON formatter.

    Should be called exactly once, before any log.* calls.
    Replaces all existing handlers on the root logger.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    # Keep uvicorn access logs quiet; error channel still propagates.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger that inherits the root JSON handler."""
    return logging.getLogger(name)
