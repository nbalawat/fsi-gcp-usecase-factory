"""
industry-risk-scorer: score industry risk on a 1-5 band using NAICS sector,
economic vintage, and US regional geography.

Inputs:  naics_code, vintage, geography
Outputs: industry_risk_band, rationale_factors

Stateless. No model calls. Sector scores, vintage adjustments, and geography
adjustments read from Cloud SQL at request time — never hardcoded.
Called by Cloud Workflows via HTTP POST; also runnable locally with functions-framework.
"""
from __future__ import annotations

import json
import math
import os
from typing import Any

import functions_framework
import sqlalchemy
try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:  # type: ignore[misc]
        return _logging.getLogger(name)
from opentelemetry import trace
from sqlalchemy import text

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)

SERVICE_NAME = "industry-risk-scorer"

_engine: sqlalchemy.Engine | None = None

BAND_LABELS: dict[int, str] = {
    1: "1-low",
    2: "2-moderate-low",
    3: "3-moderate",
    4: "4-high",
    5: "5-very-high",
}

MIN_BAND = 1
MAX_BAND = 5

VALID_GEOGRAPHIES = {
    "coastal", "midwest", "rural", "northeast", "southeast",
    "southwest", "mountain", "pacific", "plains",
}


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
                    ip_type=os.environ.get("DB_IP_TYPE", "PRIVATE"),
                )

            _engine = sqlalchemy.create_engine(
                "postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0
            )
    return _engine


def _load_thresholds() -> dict[str, Any]:
    """
    Load all industry risk scoring parameters from Cloud SQL.

    Returns a dict with three sub-dicts:
      thresholds["sector_risk"]       — naics_prefix -> (base_score, sector_label)
      thresholds["vintage_adj"]       — year (int) -> (adjustment, explanation)
      thresholds["geography_adj"]     — geography_key -> (adjustment, explanation)
      thresholds["default_sector_score"] — float fallback for unknown NAICS
      thresholds["pre_2007_adjustment"]  — float adjustment for vintages before 2007

    NEVER hardcode any of these values — they live in the Cloud SQL threshold table.
    """
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT record_type, lookup_key, numeric_value, secondary_value, label_text
                FROM industry_risk_scorer_thresholds
                WHERE effective_date <= CURRENT_DATE
                ORDER BY effective_date DESC
                LIMIT 500
            """),
        ).fetchall()

    sector_risk: dict[str, tuple[float, str]] = {}
    vintage_adj: dict[int, tuple[float, str]] = {}
    geography_adj: dict[str, tuple[float, str]] = {}
    scalar: dict[str, float] = {}

    for row in rows:
        rtype = row[0]
        key = row[1]
        num = float(row[2])
        label = str(row[4] or "")

        if rtype == "sector_risk":
            sector_risk[key] = (num, label)
        elif rtype == "vintage_adjustment":
            vintage_adj[int(key)] = (num, label)
        elif rtype == "geography_adjustment":
            geography_adj[key] = (num, label)
        elif rtype == "scalar":
            scalar[key] = num

    return {
        "sector_risk": sector_risk,
        "vintage_adj": vintage_adj,
        "geography_adj": geography_adj,
        "default_sector_score": scalar.get("default_sector_score", 3.0),
        "pre_2007_adjustment": scalar.get("pre_2007_adjustment", 0.25),
    }



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
                    "ctx": context_id,                    "inp": json.dumps(_redact(inputs)),
                    "out": json.dumps(_redact(result or {})),
                    "err": error,
                },
            )
    except Exception as audit_err:
        logger.warning("audit_write_failed", extra={"error": str(audit_err)})


# ── Pure computation functions ────────────────────────────────────────────────

def resolve_sector(
    naics_code: str,
    sector_risk: dict[str, tuple[float, str]],
    default_score: float,
) -> tuple[float, str, str]:
    """
    Return (base_score, sector_label, naics_prefix).
    Falls back to default_score if the NAICS is not in the table.
    """
    prefix = str(naics_code).strip()[:2]
    if prefix in sector_risk:
        score, label = sector_risk[prefix]
        return score, label, prefix
    return default_score, "unknown sector", prefix


def resolve_vintage_adjustment(
    vintage: int | str,
    vintage_adj: dict[int, tuple[float, str]],
    pre_2007_adjustment: float,
) -> tuple[float, str]:
    """
    Return (adjustment, explanation).
    Unlisted years >= 2023 treated as neutral (0); years before 2007 use pre_2007_adjustment.
    """
    try:
        year = int(vintage)
    except (TypeError, ValueError):
        return 0.0, f"vintage '{vintage}' not parseable — neutral adjustment applied"

    if year in vintage_adj:
        adj, explanation = vintage_adj[year]
        return adj, explanation

    if year < 2007:
        return pre_2007_adjustment, (
            f"pre-2007 vintage ({year}) — limited cycle data, modest upward adjustment"
        )

    # Future or unlisted years: neutral
    return 0.0, f"vintage {year} — neutral cycle position assumed"


def resolve_geography_adjustment(
    geography: str,
    geography_adj: dict[str, tuple[float, str]],
) -> tuple[float, str]:
    """
    Return (adjustment, explanation).
    Unknown geographies default to 0.0 (coastal baseline).
    """
    geo_lower = str(geography).strip().lower()
    if geo_lower in geography_adj:
        adj, explanation = geography_adj[geo_lower]
        return adj, explanation
    return 0.0, f"geography '{geography}' not in lookup — baseline adjustment applied"


def clamp_band(raw_score: float) -> int:
    """Round raw_score to nearest integer (half-up) and clamp to [1, 5]."""
    rounded = math.floor(raw_score + 0.5)
    return max(MIN_BAND, min(MAX_BAND, rounded))


def build_rationale_factors(
    base_score: float,
    sector_label: str,
    naics_prefix: str,
    vintage_adj: float,
    vintage_explanation: str,
    geo_adj: float,
    geo_explanation: str,
    raw_score: float,
    final_band: int,
) -> list[dict[str, Any]]:
    return [
        {
            "factor": "sector_base_risk",
            "contribution": base_score,
            "explanation": (
                f"NAICS prefix '{naics_prefix}' maps to '{sector_label}' "
                f"with a base risk score of {base_score:.1f} on the 1-5 scale."
            ),
        },
        {
            "factor": "economic_vintage",
            "contribution": vintage_adj,
            "explanation": vintage_explanation,
        },
        {
            "factor": "geographic_region",
            "contribution": geo_adj,
            "explanation": geo_explanation,
        },
        {
            "factor": "composite_score",
            "contribution": raw_score,
            "explanation": (
                f"Raw composite = {base_score:.2f} + {vintage_adj:.2f} (vintage) "
                f"+ {geo_adj:.2f} (geography) = {raw_score:.2f}, "
                f"clamped to band {final_band} ('{BAND_LABELS[final_band]}')."
            ),
        },
    ]


def validate_inputs(payload: dict[str, Any]) -> None:
    required = ["naics_code", "vintage", "geography"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValueError(f"missing required fields: {missing}")

    # Validate vintage is numeric
    try:
        int(payload["vintage"])
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"vintage must be a numeric year, got '{payload['vintage']}'"
        ) from exc

    geo = str(payload["geography"]).strip().lower()
    if geo not in VALID_GEOGRAPHIES:
        raise ValueError(
            f"geography must be one of {sorted(VALID_GEOGRAPHIES)}, got '{payload['geography']}'"
        )


def process(payload: dict[str, Any]) -> dict[str, Any]:
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        thresholds = _load_thresholds()

        validate_inputs(payload)

        naics_code = str(payload["naics_code"])
        vintage = payload["vintage"]
        geography = str(payload["geography"]).strip().lower()

        base_score, sector_label, naics_prefix = resolve_sector(
            naics_code,
            thresholds["sector_risk"],
            thresholds["default_sector_score"],
        )
        vintage_adj_val, vintage_explanation = resolve_vintage_adjustment(
            vintage,
            thresholds["vintage_adj"],
            thresholds["pre_2007_adjustment"],
        )
        geo_adj_val, geo_explanation = resolve_geography_adjustment(
            geography,
            thresholds["geography_adj"],
        )

        raw_score = base_score + vintage_adj_val + geo_adj_val
        final_band = clamp_band(raw_score)
        industry_risk_band = BAND_LABELS[final_band]

        rationale_factors = build_rationale_factors(
            base_score=base_score,
            sector_label=sector_label,
            naics_prefix=naics_prefix,
            vintage_adj=vintage_adj_val,
            vintage_explanation=vintage_explanation,
            geo_adj=geo_adj_val,
            geo_explanation=geo_explanation,
            raw_score=raw_score,
            final_band=final_band,
        )

        span.set_attribute("service.name", SERVICE_NAME)
        span.set_attribute("context_id", str(payload.get("context_id", "")))

        return {
            "industry_risk_band": industry_risk_band,
            "rationale_factors": rationale_factors,
            "context_id": payload.get("context_id"),
            "borrower_id": payload.get("borrower_id"),
            "naics_code": naics_code,
            "vintage": int(vintage),
            "geography": geography,
            "_debug": {
                "sector_label": sector_label,
                "base_score": base_score,
                "vintage_adj": vintage_adj_val,
                "geo_adj": geo_adj_val,
                "raw_score": raw_score,
                "final_band": final_band,
            },
        }


# ── Cloud Run entry point ─────────────────────────────────────────────────────

@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    payload: dict[str, Any] = {}
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        payload = request.get_json(force=True) or {}
        result = process(payload)
        logger.info(
            "risk_score_complete",
            extra={
                "context_id": payload.get("context_id"),
                "naics_code": payload.get("naics_code"),
                "industry_risk_band": result.get("industry_risk_band"),
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
