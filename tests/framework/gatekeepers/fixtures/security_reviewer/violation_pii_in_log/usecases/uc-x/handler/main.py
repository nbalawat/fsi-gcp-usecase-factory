"""Handler that uses stdlib logging — PII LEAK RISK.

Without redacting_logger, any borrower_id, EIN, or loan amount in the extras
dict gets written to Cloud Logging in plaintext.
"""
from __future__ import annotations

import logging  # VIOLATION: stdlib logging, no redaction
import os
from typing import Any

logger = logging.getLogger("uc-x.handler")


def handle(event: dict[str, Any]) -> dict[str, Any]:
    # The borrower_id and loan_amount go to logs unredacted.
    logger.info("received", extra=event)
    return {"context_id": event.get("context_id")}
