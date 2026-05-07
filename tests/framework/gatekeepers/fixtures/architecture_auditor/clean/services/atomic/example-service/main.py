"""Clean atomic service — reads thresholds from Cloud SQL, no hardcoded constants, no print()."""
from __future__ import annotations

import json
import os
from typing import Any

import sqlalchemy
from sqlalchemy import text

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:
        return _logging.getLogger(name)

logger = redacting_logger(__name__)
SERVICE_NAME = "example-service"

_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL", "sqlite:///:memory:")
        _engine = sqlalchemy.create_engine(url, pool_size=2, max_overflow=0)
    return _engine


def _load_thresholds() -> dict[str, float]:
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("SELECT threshold_name, threshold_value FROM thresholds WHERE service_name = :svc"),
            {"svc": SERVICE_NAME},
        ).fetchall()
    return {r[0]: float(r[1]) for r in rows}


def process(payload: dict[str, Any]) -> dict[str, Any]:
    thresholds = _load_thresholds()
    return {"context_id": payload.get("context_id"), "thresholds_loaded": len(thresholds)}
