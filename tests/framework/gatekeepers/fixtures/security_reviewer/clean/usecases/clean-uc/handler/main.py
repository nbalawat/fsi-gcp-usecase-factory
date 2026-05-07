"""Clean handler — uses redacting_logger, no PII in extras, fail-closed env vars."""
from __future__ import annotations

import os
from typing import Any

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:
        return _logging.getLogger(name)

logger = redacting_logger("clean-handler")


def handle(event: dict[str, Any]) -> dict[str, Any]:
    project = os.environ["GCP_PROJECT"]  # fail-closed
    logger.info("event_received", extra={"context_id": event.get("context_id"), "project": project})
    return {"context_id": event.get("context_id"), "status": "enriched"}
