"""loan-to-value-calc: compute LTV ratio + band classification.

Atomic service — stateless. Algorithm lives in this service; band cutoffs
are read from Cloud SQL via _load_thresholds().
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
    def redacting_logger(name: str) -> _logging.Logger:
        return _logging.getLogger(name)

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)
SERVICE_NAME = "loan-to-value-calc"
_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL")
        if url:
            _engine = sqlalchemy.create_engine(url, pool_size=2, max_overflow=0)
        else:
            from google.cloud.sql.connector import Connector
            connector = Connector()
            def getconn():
                return connector.connect(
                    os.environ["INSTANCE_CONNECTION_NAME"],
                    "pg8000",
                    user=os.environ["DB_USER"],
                    password=os.environ["DB_PASS"],
                    db=os.environ.get("DB_NAME", "fsi_banking"),
                    ip_type=os.environ.get("DB_IP_TYPE", "PRIVATE"),
                )
            _engine = sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0)
    return _engine


def _load_thresholds() -> dict[str, float]:
    from datetime import date
    today = date.today().isoformat()
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT threshold_name, threshold_value FROM thresholds t
                WHERE service_name = :svc AND effective_date <= :today
                  AND effective_date = (
                    SELECT MAX(effective_date) FROM thresholds
                    WHERE service_name = :svc AND threshold_name = t.threshold_name
                      AND effective_date <= :today)
            """),
            {"svc": SERVICE_NAME, "today": today},
        ).fetchall()
    return {r[0]: float(r[1]) for r in rows}


def _write_audit(context_id, inputs, result, error=None):
    from datetime import datetime, timezone
    try:
        with _get_engine().begin() as conn:
            conn.execute(
                text("INSERT INTO audit_events (service_name, context_id, inputs_summary, outputs_summary, error, invoked_at) VALUES (:svc, :ctx, :inp, :out, :err, :ts)"),
                {"svc": SERVICE_NAME, "ctx": context_id,
                 "inp": json.dumps({k: str(v)[:200] for k, v in inputs.items()}),
                 "out": json.dumps({k: str(v)[:200] for k, v in (result or {}).items()}),
                 "err": error, "ts": datetime.now(timezone.utc).isoformat()},
            )
    except Exception as e:
        logger.warning("audit_write_failed", extra={"error": str(e)})


def compute_ltv(loan_amount: float, collateral_value: float) -> float:
    if collateral_value <= 0:
        return float("inf")
    return round(loan_amount / collateral_value, 4)


def classify_ltv(ltv: float, thresholds: dict[str, float]) -> str:
    pass_max = thresholds.get("ltv_pass_max", 0.80)
    watch_max = thresholds.get("ltv_watch_max", 0.90)
    if ltv <= pass_max: return "pass"
    if ltv <= watch_max: return "watch"
    return "fail"


def process(payload: dict[str, Any]) -> dict[str, Any]:
    context_id = payload.get("context_id", "unknown")
    result, error = {}, None
    try:
        with tracer.start_as_current_span(SERVICE_NAME):
            loan_amount = float(payload["loan_amount"])
            collateral_value = float(payload["collateral_value"])
            thresholds = _load_thresholds()
            ltv = compute_ltv(loan_amount, collateral_value)
            band = classify_ltv(ltv, thresholds)
            result = {"ltv": ltv, "ltv_band": band, "context_id": context_id}
            return result
    except Exception as e:
        error = str(e); raise
    finally:
        _write_audit(context_id, payload, result, error)


@functions_framework.http
def main(request):
    try:
        payload = request.get_json(force=True) or {}
        return json.dumps(process(payload)), 200, {"Content-Type": "application/json"}
    except ValueError as e:
        return json.dumps({"error": str(e)}), 400, {"Content-Type": "application/json"}
    except Exception as e:
        logger.error("unexpected_error", extra={"error": str(e)})
        return json.dumps({"error": "internal"}), 500, {"Content-Type": "application/json"}
