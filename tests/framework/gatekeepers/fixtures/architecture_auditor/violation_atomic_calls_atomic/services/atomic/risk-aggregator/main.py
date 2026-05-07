"""Risk aggregator that VIOLATES the 'atomic services do not call other atomic services' rule.

The architecture-auditor must catch the cross-service import below — composition
must happen in the workflow, never inside an atomic service.
"""
from __future__ import annotations

import os
from typing import Any

# VIOLATION: cross-service import of another atomic service
from services.atomic.dscr_calculator.main import process as compute_dscr  # type: ignore[import-not-found]


def process(payload: dict[str, Any]) -> dict[str, Any]:
    dscr_result = compute_dscr(payload)
    return {"dscr": dscr_result.get("dscr_base"), "context_id": payload.get("context_id")}
