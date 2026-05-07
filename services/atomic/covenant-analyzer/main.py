"""
covenant-analyzer: test proposed loan covenants against borrower financials and project
whether any covenant will be breached over the next 4 quarters.

Atomic service — stateless, sophisticated financial computation.
Policy warn-zone cutoff comes from Cloud SQL; projection algorithm lives in this service.
Called by Cloud Workflows via HTTP POST.

Inputs:  proposed_covenants, spread_financials, trailing_quarters
Outputs: covenant_test_results, headroom_pct, violations_projected

Supported covenant types:
  dscr_minimum              — Debt Service Coverage Ratio must be >= threshold
  leverage_maximum          — Debt / EBITDA must be <= threshold
  current_ratio_minimum     — Current Assets / Current Liabilities must be >= threshold
  interest_coverage_minimum — EBIT / Interest Expense must be >= threshold
  debt_to_equity_maximum    — Total Debt / Total Equity must be <= threshold
"""
from __future__ import annotations

import json
import os
from typing import Any

import functions_framework
import sqlalchemy
from opentelemetry import trace
from sqlalchemy import text

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:  # type: ignore[misc]
        return _logging.getLogger(name)

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)

SERVICE_NAME = "covenant-analyzer"

_engine: sqlalchemy.Engine | None = None

# Covenant types where a higher ratio is better (must be >= threshold)
_MINIMUM_COVENANTS = {"dscr_minimum", "current_ratio_minimum", "interest_coverage_minimum"}
# Covenant types where a lower ratio is better (must be <= threshold)
_MAXIMUM_COVENANTS = {"leverage_maximum", "debt_to_equity_maximum"}
_ALL_COVENANT_TYPES = _MINIMUM_COVENANTS | _MAXIMUM_COVENANTS

# Ratio keys used to extract each covenant's actual value from spread_financials
_RATIO_KEY_MAP: dict[str, str] = {
    "dscr_minimum": "dscr",
    "leverage_maximum": "leverage_ratio",
    "current_ratio_minimum": "current_ratio",
    "interest_coverage_minimum": "interest_coverage",
    "debt_to_equity_maximum": "debt_to_equity",
}


def _get_engine() -> sqlalchemy.Engine:
    """Portable DB engine: DATABASE_URL env var (any PostgreSQL) or Cloud SQL Auth Proxy."""
    global _engine
    if _engine is None:
        database_url = os.environ.get("DATABASE_URL")
        if database_url:
            _engine = sqlalchemy.create_engine(database_url, pool_size=2, max_overflow=0)
        else:
            from google.cloud.sql.connector import Connector  # type: ignore[import]
            connector = Connector()

            def getconn():  # type: ignore[return]
                return connector.connect(
                    os.environ["INSTANCE_CONNECTION_NAME"],
                    "pg8000",
                    user=os.environ["DB_USER"],
                    password=os.environ["DB_PASS"],
                    db=os.environ.get("DB_NAME", "fsi_banking"),
                )

            _engine = sqlalchemy.create_engine(
                "postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0
            )
    return _engine


def _load_thresholds() -> dict[str, Any]:
    """Load current policy thresholds from Cloud SQL — never hardcode these.

    Returns configurable policy cutoffs: warn_headroom_pct governs the warn/pass boundary.
    Projection math (linear trend, 4-quarter horizon) stays in this service.
    """
    from datetime import date
    today = date.today().isoformat()
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT threshold_name, threshold_value
                FROM thresholds t
                WHERE service_name = :svc
                  AND effective_date <= :today
                  AND effective_date = (
                      SELECT MAX(effective_date) FROM thresholds
                      WHERE service_name = :svc
                        AND threshold_name = t.threshold_name
                        AND effective_date <= :today
                  )
            """),
            {"svc": SERVICE_NAME, "today": today},
        ).fetchall()
    return {r[0]: float(r[1]) for r in rows}


def _write_audit(
    context_id: str, inputs: dict, result: dict, error: str | None = None
) -> None:
    """Mandatory audit write — fires in finally block, swallows its own errors."""
    from datetime import datetime, timezone
    try:
        with _get_engine().begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO audit_events
                        (service_name, context_id, inputs_summary, outputs_summary, error, invoked_at)
                    VALUES (:svc, :ctx, :inp, :out, :err, :ts)
                """),
                {
                    "svc": SERVICE_NAME,
                    "ctx": context_id,
                    "inp": json.dumps({k: str(v)[:200] for k, v in inputs.items()}),
                    "out": json.dumps({k: str(v)[:200] for k, v in (result or {}).items()}),
                    "err": error,
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as audit_err:
        logger.warning("audit_write_failed", extra={"error": str(audit_err)})


# ── Core computation (pure functions — easy to unit test) ──────────────────

def _extract_actual(covenant_type: str, spread_financials: dict[str, Any]) -> float:
    """Pull the relevant ratio value out of spread_financials."""
    if covenant_type not in _ALL_COVENANT_TYPES:
        raise ValueError(
            f"unknown covenant_type '{covenant_type}'; "
            f"supported: {sorted(_ALL_COVENANT_TYPES)}"
        )
    ratio_key = _RATIO_KEY_MAP[covenant_type]
    actual = spread_financials.get(ratio_key)
    if actual is None:
        nested = spread_financials.get("ratios", {})
        actual = nested.get(ratio_key)
    if actual is None:
        raise ValueError(
            f"spread_financials is missing '{ratio_key}' required for {covenant_type}"
        )
    return float(actual)


def _compute_headroom(
    covenant_type: str,
    threshold: float,
    actual: float,
) -> float:
    """Return signed headroom as a percentage of threshold.

    Minimum covenants: (actual - threshold) / threshold * 100  (positive = passing)
    Maximum covenants: (threshold - actual) / threshold * 100  (positive = passing)
    """
    if threshold == 0:
        return 0.0
    if covenant_type in _MINIMUM_COVENANTS:
        return round((actual - threshold) / threshold * 100, 4)
    else:
        return round((threshold - actual) / threshold * 100, 4)


def _determine_status(headroom_pct: float, warn_threshold_pct: float) -> str:
    """Convert headroom percentage to pass/warn/fail label.

    warn_threshold_pct comes from Cloud SQL — it is the policy cutoff, not an algorithm constant.
    """
    if headroom_pct < 0:
        return "fail"
    if headroom_pct <= warn_threshold_pct:
        return "warn"
    return "pass"


def check_covenant(
    covenant: dict[str, Any],
    spread_financials: dict[str, Any],
    warn_threshold_pct: float,
) -> dict[str, Any]:
    """Test a single covenant against current spread_financials."""
    covenant_type = covenant["covenant_type"]
    threshold = float(covenant["threshold"])
    actual = _extract_actual(covenant_type, spread_financials)
    headroom_pct = _compute_headroom(covenant_type, threshold, actual)
    status = _determine_status(headroom_pct, warn_threshold_pct)

    return {
        "covenant_type": covenant_type,
        "threshold": threshold,
        "actual": round(actual, 4),
        "status": status,
        "headroom_pct": headroom_pct,
    }


def project_covenant(
    covenant: dict[str, Any],
    trailing_quarters: list[dict[str, Any]],
) -> dict[str, Any]:
    """Project each of the next 4 quarters using the trailing linear trend.

    Mean quarter-over-quarter delta across trailing_quarters drives the projection.
    If fewer than 2 data points exist, trend defaults to 0 (flat).
    """
    covenant_type = covenant["covenant_type"]
    threshold = float(covenant["threshold"])
    ratio_key = _RATIO_KEY_MAP[covenant_type]

    historical: list[float] = []
    for q in trailing_quarters:
        val = q.get(ratio_key)
        if val is not None:
            historical.append(float(val))

    if len(historical) >= 2:
        deltas = [historical[i + 1] - historical[i] for i in range(len(historical) - 1)]
        trend = sum(deltas) / len(deltas)
    else:
        trend = 0.0

    last_value = historical[-1] if historical else 0.0

    projected_values: list[float] = []
    first_breach_quarter: int | None = None
    for q_idx in range(1, 5):
        proj = round(last_value + trend * q_idx, 4)
        projected_values.append(proj)
        if first_breach_quarter is None:
            headroom = _compute_headroom(covenant_type, threshold, proj)
            if headroom < 0:
                first_breach_quarter = q_idx

    return {
        "covenant_type": covenant_type,
        "threshold": threshold,
        "projected_values": projected_values,
        "first_breach_quarter": first_breach_quarter,
        "violations_projected": first_breach_quarter is not None,
    }


def process(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Inputs:  proposed_covenants, spread_financials, trailing_quarters
    Outputs: covenant_test_results, headroom_pct, violations_projected

    Audit is written to Cloud SQL in a try/finally so failures are captured too.
    """
    context_id = payload.get("context_id", "unknown")
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        with tracer.start_as_current_span(SERVICE_NAME) as span:
            proposed_covenants: list[dict[str, Any]] = payload.get("proposed_covenants", [])
            spread_financials: dict[str, Any] = payload.get("spread_financials", {})
            trailing_quarters: list[dict[str, Any]] = payload.get("trailing_quarters", [])

            if not isinstance(proposed_covenants, list):
                raise ValueError("proposed_covenants must be a list")
            if not isinstance(spread_financials, dict):
                raise ValueError("spread_financials must be an object")
            if not isinstance(trailing_quarters, list):
                raise ValueError("trailing_quarters must be a list")

            span.set_attribute("service.name", SERVICE_NAME)
            span.set_attribute("context_id", context_id)

            thresholds = _load_thresholds()
            warn_pct = thresholds.get("warn_headroom_pct", 5.0)

            covenant_test_results: list[dict[str, Any]] = []
            headroom_pct: dict[str, float] = {}
            violations_projected: list[dict[str, Any]] = []

            for covenant in proposed_covenants:
                if "covenant_type" not in covenant:
                    raise ValueError("each covenant must have a 'covenant_type' field")
                if "threshold" not in covenant:
                    raise ValueError("each covenant must have a 'threshold' field")

                test_result = check_covenant(covenant, spread_financials, warn_pct)
                covenant_test_results.append(test_result)
                headroom_pct[covenant["covenant_type"]] = test_result["headroom_pct"]

                projection = project_covenant(covenant, trailing_quarters)
                if projection["violations_projected"]:
                    violations_projected.append(projection)

            result = {
                "covenant_test_results": covenant_test_results,
                "headroom_pct": headroom_pct,
                "violations_projected": violations_projected,
                "context_id": context_id,
                "borrower_id": payload.get("borrower_id"),
            }
            return result
    except Exception as e:
        error_msg = str(e)
        raise
    finally:
        _write_audit(context_id, payload, result, error_msg)


# ── Cloud Run entry point ──────────────────────────────────────────────────

@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    """Cloud Run HTTP entry point. Audit is handled inside process()."""
    try:
        payload = request.get_json(force=True) or {}
        result = process(payload)
        return json.dumps(result), 200, {"Content-Type": "application/json"}
    except ValueError as e:
        logger.warning("validation_error", extra={"error": str(e)})
        return json.dumps({"error": str(e)}), 400, {"Content-Type": "application/json"}
    except Exception as e:
        logger.error("unexpected_error", extra={"error": str(e)})
        return json.dumps({"error": "internal"}), 500, {"Content-Type": "application/json"}
