"""
collateral-valuator: value collateral items and compute lendable amounts.

Inputs:  collateral_descriptions (list of {type, estimated_value, age_years, condition}),
         valuation_date
Outputs: valuation_per_item, haircut_per_item, lendable_value

Collateral haircut percentages and condition multipliers are loaded from Cloud SQL
at request time — never hardcoded in source.

Stateless. No model calls. No external I/O beyond structured logging.
Called by Cloud Workflows via HTTP POST; also runnable locally with functions-framework.
"""
from __future__ import annotations

import json
import os
from typing import Any

import functions_framework
import sqlalchemy
from bank.logging import redacting_logger
from opentelemetry import trace
from sqlalchemy import text

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)

SERVICE_NAME = "collateral-valuator"

_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
    """Portable: DATABASE_URL (any PostgreSQL) or Cloud SQL Auth Proxy."""
    global _engine
    if _engine is None:
        database_url = os.environ.get("DATABASE_URL")
        if database_url:
            _engine = sqlalchemy.create_engine(database_url, pool_size=2, max_overflow=0)
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
                )

            _engine = sqlalchemy.create_engine(
                "postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0
            )
    return _engine


def _load_thresholds() -> dict[str, Any]:
    """
    Load collateral policy parameters from Cloud SQL.

    Returns a dict with two sub-dicts:
      thresholds["type_config"]          — collateral_type ->
                                           {base_haircut, age_decay_per_year, max_haircut}
      thresholds["condition_multipliers"] — condition_label -> multiplier float

    NEVER hardcode haircut percentages or condition multipliers — they live in Cloud SQL.
    """
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT record_type, lookup_key, base_haircut, age_decay_per_year,
                       max_haircut, multiplier_value
                FROM collateral_valuator_thresholds
                WHERE effective_date <= CURRENT_DATE
                ORDER BY effective_date DESC
                LIMIT 200
            """),
        ).fetchall()

    type_config: dict[str, dict[str, float]] = {}
    condition_multipliers: dict[str, float] = {}

    for row in rows:
        rtype = row[0]
        key = str(row[1])

        if rtype == "haircut_config":
            type_config[key] = {
                "base_haircut": float(row[2]),
                "age_decay_per_year": float(row[3] or 0),
                "max_haircut": float(row[4]),
            }
        elif rtype == "condition_multiplier":
            condition_multipliers[key] = float(row[5])

    return {
        "type_config": type_config,
        "condition_multipliers": condition_multipliers,
    }


def _write_audit(
    context_id: str,
    inputs: dict[str, Any],
    result: dict[str, Any],
    error: str | None = None,
) -> None:
    """
    Write an audit record to Cloud SQL. Fires in try/finally — even on error.
    Errors here are logged but never re-raised so they cannot mask the primary error.
    """
    try:
        with _get_engine().begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO audit_events (service_name, context_id, inputs_summary, outputs_summary, error)
                    VALUES (:svc, :ctx, :inp, :out, :err)
                """),
                {
                    "svc": SERVICE_NAME,
                    "ctx": context_id,
                    "inp": json.dumps({k: str(v)[:200] for k, v in inputs.items()}),
                    "out": json.dumps({k: str(v)[:200] for k, v in (result or {}).items()}),
                    "err": error,
                },
            )
    except Exception as audit_err:
        logger.warning("audit_write_failed", extra={"error": str(audit_err)})


# ── Core computation (pure functions — easy to unit test) ──────────────────────

def adjusted_value(
    estimated_value: float,
    condition: str,
    condition_multipliers: dict[str, float],
) -> float:
    """Apply condition multiplier to estimated value.

    Unknown conditions fall back to the policy-defined `unknown` multiplier
    (loaded from Cloud SQL into condition_multipliers). If no such row exists,
    raise — never silently apply a hardcoded haircut to an unknown condition.
    """
    cond_key = condition.lower()
    multiplier = condition_multipliers.get(cond_key)
    if multiplier is None:
        multiplier = condition_multipliers.get("unknown")
    if multiplier is None:
        raise ValueError(
            f"no condition multiplier for {condition!r} and no 'unknown' fallback "
            "configured in Cloud SQL — refusing to compute an arbitrary haircut"
        )
    return round(estimated_value * multiplier, 2)


def compute_haircut(
    collateral_type: str,
    age_years: float,
    type_config: dict[str, dict[str, float]],
) -> tuple[float, str]:
    """
    Return (haircut_pct, rationale) for a given collateral type and age.
    haircut_pct is a fraction (e.g. 0.20 = 20%).
    type_config is loaded from Cloud SQL — not hardcoded.
    """
    cfg = type_config.get(collateral_type.lower())
    if cfg is None:
        raise ValueError(
            f"unsupported collateral type: {collateral_type!r}. "
            f"Supported: {sorted(type_config)}"
        )

    base = cfg["base_haircut"]
    decay = cfg["age_decay_per_year"] * max(0.0, float(age_years))
    raw = base + decay
    haircut = min(raw, cfg["max_haircut"])
    haircut = round(haircut, 4)

    if cfg["age_decay_per_year"] > 0:
        rationale = (
            f"{int(base * 100)}% base haircut for {collateral_type} "
            f"+ {int(cfg['age_decay_per_year'] * 100)}%/yr decay over "
            f"{age_years:.1f} yrs (capped at {int(cfg['max_haircut'] * 100)}%)"
        )
    else:
        rationale = f"Standard {int(base * 100)}% haircut for {collateral_type}"
    return haircut, rationale


def value_item(
    item: dict[str, Any],
    type_config: dict[str, dict[str, float]],
    condition_multipliers: dict[str, float],
) -> tuple[dict[str, Any], dict[str, Any], float]:
    """
    Value a single collateral item.

    Returns:
        valuation entry, haircut entry, lendable contribution
    """
    ctype = str(item.get("type", "")).strip()
    estimated = float(item.get("estimated_value", 0))
    age = float(item.get("age_years", 0))
    condition = str(item.get("condition", "good")).strip()

    adj = adjusted_value(estimated, condition, condition_multipliers)
    haircut_pct, rationale = compute_haircut(ctype, age, type_config)
    lendable = round(adj * (1.0 - haircut_pct), 2)

    valuation_entry = {
        "type": ctype,
        "estimated_value": estimated,
        "adjusted_value": adj,
        "condition": condition,
    }
    haircut_entry = {
        "type": ctype,
        "haircut_pct": haircut_pct,
        "rationale": rationale,
    }
    return valuation_entry, haircut_entry, lendable


def validate_inputs(payload: dict[str, Any]) -> None:
    if "collateral_descriptions" not in payload:
        raise ValueError("missing required field: collateral_descriptions")
    if not isinstance(payload["collateral_descriptions"], list):
        raise ValueError("collateral_descriptions must be a list")
    if len(payload["collateral_descriptions"]) == 0:
        raise ValueError("collateral_descriptions must not be empty")
    for i, item in enumerate(payload["collateral_descriptions"]):
        if not isinstance(item, dict):
            raise ValueError(f"collateral_descriptions[{i}] must be an object")
        if "type" not in item:
            raise ValueError(f"collateral_descriptions[{i}] missing required field: type")
        if "estimated_value" not in item:
            raise ValueError(f"collateral_descriptions[{i}] missing required field: estimated_value")


def process(payload: dict[str, Any]) -> dict[str, Any]:
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        thresholds = _load_thresholds()
        type_config = thresholds["type_config"]
        condition_multipliers = thresholds["condition_multipliers"]

        validate_inputs(payload)

        items = payload["collateral_descriptions"]
        valuation_date = payload.get("valuation_date", "")
        context_id = payload.get("context_id")
        borrower_id = payload.get("borrower_id")

        valuation_per_item: list[dict[str, Any]] = []
        haircut_per_item: list[dict[str, Any]] = []
        total_lendable = 0.0

        for item in items:
            val_entry, haircut_entry, lendable = value_item(item, type_config, condition_multipliers)
            valuation_per_item.append(val_entry)
            haircut_per_item.append(haircut_entry)
            total_lendable += lendable

        span.set_attribute("service.name", SERVICE_NAME)
        span.set_attribute("context_id", str(context_id or ""))

        return {
            "valuation_per_item": valuation_per_item,
            "haircut_per_item": haircut_per_item,
            "lendable_value": round(total_lendable, 2),
            "valuation_date": valuation_date,
            "context_id": context_id,
            "borrower_id": borrower_id,
        }


# ── Cloud Run entry point ──────────────────────────────────────────────────────

@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    payload: dict[str, Any] = {}
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        payload = request.get_json(force=True) or {}
        result = process(payload)
        logger.info(
            "valuation_complete",
            extra={
                "context_id": payload.get("context_id"),
                "item_count": len(result.get("valuation_per_item", [])),
                "lendable_value": result.get("lendable_value"),
            },
        )
        return json.dumps(result), 200, {"Content-Type": "application/json"}
    except ValueError as e:
        error_msg = str(e)
        logger.warning("validation_error", extra={"error": error_msg})
        return json.dumps({"error": error_msg}), 400, {"Content-Type": "application/json"}
    except Exception as e:
        error_msg = str(e)
        logger.error("unexpected_error", extra={"error": error_msg})
        return json.dumps({"error": "internal server error"}), 500, {"Content-Type": "application/json"}
    finally:
        _write_audit(
            payload.get("context_id", "unknown"),
            payload,
            result,
            error_msg,
        )
