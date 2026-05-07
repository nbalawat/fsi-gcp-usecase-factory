"""Handler with business logic embedded — VIOLATION.

Handlers must only validate, normalise, enrich, and forward. All policy
comparisons (loan size tiers, thresholds, etc.) belong in the rules-service.
"""
from __future__ import annotations

from typing import Any


def handle(event: dict[str, Any]) -> dict[str, Any]:
    loan_amount = float(event["loan_amount"])
    # VIOLATION: business-rule comparison in handler
    if loan_amount > 1_000_000:
        return {"route": "manual-review"}
    return {"route": "auto-flow"}
