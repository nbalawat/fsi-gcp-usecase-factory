"""Clean atomic service — passes all service-validator checks."""
from __future__ import annotations

import os
from typing import Any

import sqlalchemy
from opentelemetry import trace
from sqlalchemy import text

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:
        return _logging.getLogger(name)

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)
SERVICE_NAME = "example-service"

_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
    global _engine
    if _engine is None:
        _engine = sqlalchemy.create_engine(
            os.environ.get("DATABASE_URL", "sqlite:///:memory:"),
            pool_size=2,
            max_overflow=0,
        )
    return _engine


def process(payload: dict[str, Any]) -> dict[str, Any]:
    with tracer.start_as_current_span(SERVICE_NAME):
        return {"score": 0.0, "band": "pass"}
