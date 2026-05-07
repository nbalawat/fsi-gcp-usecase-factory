"""Noisy service that uses print() — VIOLATION.

Production code must use the redacting logger so PII never lands in logs as
plain text. print() bypasses both structure and redaction.
"""
from __future__ import annotations

from typing import Any


def process(payload: dict[str, Any]) -> dict[str, Any]:
    # VIOLATION: print() in production code path
    print(f"processing payload: {payload}")
    return {"context_id": payload.get("context_id")}
