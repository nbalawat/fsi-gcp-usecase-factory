"""Atomic service WITHOUT OTel imports — service-validator should WARN."""
from __future__ import annotations

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

# VIOLATION: no `from opentelemetry import trace` and no tracer use


def process(payload: dict[str, Any]) -> dict[str, Any]:
    return {"score": 0.0, "band": "pass"}
