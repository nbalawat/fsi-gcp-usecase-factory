"""Exposure checker with a hardcoded regulatory threshold — VIOLATION.

The OCC single-borrower limit must come from the Cloud SQL `thresholds` table,
versioned by effective_date. Hardcoding it in code means a regulatory change
requires a redeploy instead of a database update.
"""
from __future__ import annotations

from typing import Any

# VIOLATION: module-scope threshold constant
OCC_SINGLE_BORROWER_LIMIT = 25.0


def check(exposure_pct: float) -> bool:
    return exposure_pct < OCC_SINGLE_BORROWER_LIMIT


def process(payload: dict[str, Any]) -> dict[str, Any]:
    return {"within_limit": check(float(payload["exposure_pct"]))}
