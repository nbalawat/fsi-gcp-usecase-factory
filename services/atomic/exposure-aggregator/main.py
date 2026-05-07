"""
exposure-aggregator: aggregate existing credit exposure for a borrower across the bank.

Atomic service — stateless, sophisticated financial computation.
Policy concentration limits come from Cloud SQL; aggregation logic lives in this service.
Called by Cloud Workflows via HTTP POST.

Inputs:  borrower_id, as_of_date, proposed_exposure (new loan amount)
Outputs: existing_exposure_committed, existing_exposure_outstanding, single_borrower_pct,
         threshold_breaches, concentration_band
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

SERVICE_NAME = "exposure-aggregator"

_engine: sqlalchemy.Engine | None = None


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
                    ip_type=os.environ.get("DB_IP_TYPE", "PRIVATE"),
                )

            _engine = sqlalchemy.create_engine(
                "postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0
            )
    return _engine


def _load_thresholds() -> dict[str, Any]:
    """Load current policy thresholds from Cloud SQL — never hardcode these.

    Returns concentration limits and Tier 1 capital.
    OCC 25% single-borrower hard limit is a regulatory constant and stays here only
    as a fallback label; the numeric limit comes from Cloud SQL.
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



# ── PII redaction for audit rows ──────────────────────────────────────────
import re as _re
_PII_KEYS = {"borrower_id", "applicant_id", "ein", "ssn", "tax_id", "name", "legal_name", "guarantor_id"}
_EIN_RE = _re.compile(r"\b\d{2}-\d{7}\b")
_SSN_RE = _re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_AMOUNT_KEYS = {"loan_amount", "outstanding_amount", "committed_amount", "exposure"}


def _redact(d: dict) -> dict:
    """Redact PII before audit-row persistence (last-4 for IDs; mask EIN/SSN; quantize amounts)."""
    out: dict = {}
    for k, v in d.items():
        if k in _PII_KEYS and isinstance(v, str):
            out[k] = f"...{v[-4:]}" if len(v) >= 4 else "***"
        elif k in {"ein", "ssn", "tax_id"}:
            out[k] = "***-redacted***"
        elif k in _AMOUNT_KEYS and isinstance(v, (int, float)):
            out[k] = round(float(v) / 100_000.0) * 100_000
        elif isinstance(v, str):
            out[k] = _EIN_RE.sub("***-EIN-***", _SSN_RE.sub("***-SSN-***", v))[:200]
        elif isinstance(v, (list, dict)):
            import json as _json
            out[k] = _json.dumps(v)[:200]
        else:
            out[k] = v
    return out


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
                    "ctx": context_id,                    "inp": json.dumps(_redact(inputs)),
                    "out": json.dumps(_redact(result or {})),
                    "err": error,
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as audit_err:
        logger.warning("audit_write_failed", extra={"error": str(audit_err)})


# ── Core computation ───────────────────────────────────────────────────────

def lookup_exposure(borrower_id: str, as_of_date: str) -> tuple[float, float]:
    """Query Cloud SQL loan_exposures table for committed and outstanding balances.

    Returns (committed, outstanding) in dollars.
    Falls back to (0, 0) if no records found — caller distinguishes new borrower
    from a data error by checking context_id logs.
    """
    with _get_engine().connect() as conn:
        row = conn.execute(
            text("""
                SELECT
                    COALESCE(SUM(committed_amount), 0) AS committed,
                    COALESCE(SUM(outstanding_amount), 0) AS outstanding
                FROM loan_exposures
                WHERE borrower_id = :bid
                  AND as_of_date <= :aod
                  AND status IN ('active', 'committed')
            """),
            {"bid": borrower_id, "aod": as_of_date},
        ).fetchone()
    if row is None:
        return 0.0, 0.0
    return float(row[0]), float(row[1])


def compute_single_borrower_pct(total_exposure: float, tier1_capital: float) -> float:
    """Compute single-borrower concentration as a percentage of Tier-1 capital."""
    if tier1_capital <= 0:
        return 0.0
    return round(total_exposure / tier1_capital * 100, 4)


def classify_concentration(pct: float, thresholds: dict[str, Any]) -> tuple[str, list[str]]:
    """Classify the concentration percentage into a band and list any threshold breaches.

    Band cutoffs and breach limits come from Cloud SQL thresholds.
    """
    occ_hard_limit = thresholds.get("occ_single_borrower_hard_limit_pct", 25.0)
    watch_limit = thresholds.get("single_borrower_watch_pct", 15.0)
    elevated_limit = thresholds.get("single_borrower_elevated_pct", 10.0)

    breaches: list[str] = []
    if pct >= occ_hard_limit:
        breaches.append(f"OCC_SINGLE_BORROWER_LIMIT: {pct:.2f}% >= {occ_hard_limit:.2f}%")

    if pct >= occ_hard_limit:
        band = "critical"
    elif pct >= watch_limit:
        band = "watch"
    elif pct >= elevated_limit:
        band = "elevated"
    else:
        band = "normal"

    return band, breaches


def validate_inputs(payload: dict[str, Any]) -> None:
    if "borrower_id" not in payload:
        raise ValueError("missing required field: borrower_id")
    if not isinstance(payload["borrower_id"], str) or not payload["borrower_id"].strip():
        raise ValueError("borrower_id must be a non-empty string")
    if "as_of_date" not in payload:
        raise ValueError("missing required field: as_of_date")
    if not isinstance(payload["as_of_date"], str) or not payload["as_of_date"].strip():
        raise ValueError("as_of_date must be a non-empty string")


def process(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Inputs:  borrower_id, as_of_date, proposed_exposure (optional new loan amount)
    Outputs: existing_exposure_committed, existing_exposure_outstanding,
             single_borrower_pct, concentration_band, threshold_breaches

    Audit is written to Cloud SQL in a try/finally so failures are captured too.
    """
    context_id = payload.get("context_id", "unknown")
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        with tracer.start_as_current_span(SERVICE_NAME) as span:
            validate_inputs(payload)

            borrower_id = payload["borrower_id"].strip()
            as_of_date = payload["as_of_date"].strip()
            proposed = float(payload.get("proposed_exposure", 0))

            span.set_attribute("service.name", SERVICE_NAME)
            span.set_attribute("context_id", context_id)

            thresholds = _load_thresholds()
            tier1_capital = thresholds.get("tier1_capital_dollars", 100_000_000.0)

            committed, outstanding = lookup_exposure(borrower_id, as_of_date)
            total_with_proposed = outstanding + proposed
            single_borrower_pct = compute_single_borrower_pct(total_with_proposed, tier1_capital)
            band, breaches = classify_concentration(single_borrower_pct, thresholds)

            result = {
                "borrower_id": borrower_id,
                "as_of_date": as_of_date,
                "existing_exposure_committed": committed,
                "existing_exposure_outstanding": outstanding,
                "proposed_exposure": proposed,
                "total_exposure_with_proposed": total_with_proposed,
                "single_borrower_pct": single_borrower_pct,
                "concentration_band": band,
                "threshold_breaches": breaches,
                "tier1_capital_used": tier1_capital,
                "context_id": context_id,
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
