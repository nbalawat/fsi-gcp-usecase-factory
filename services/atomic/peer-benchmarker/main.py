"""
peer-benchmarker: compute percentile rankings for a borrower against a NAICS peer group.

Inputs:  borrower_naics, borrower_size_band, borrower_ratios
Outputs: peer_set, ratio_percentiles

Stateless. No model calls. Peer data and thresholds read from Cloud SQL at request time.
Called by Cloud Workflows via HTTP POST; also runnable locally with functions-framework.
"""
from __future__ import annotations

import json
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

SERVICE_NAME = "peer-benchmarker"

_engine: sqlalchemy.Engine | None = None

VALID_SIZE_BANDS = {"small", "mid", "large"}
SUPPORTED_RATIOS = {"dscr", "leverage", "current_ratio", "ebitda_margin"}


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
    """Load policy cutoffs from Cloud SQL. Algorithm logic stays in the service."""
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT DISTINCT ON (threshold_name) threshold_name, threshold_value
                FROM thresholds
                WHERE service_name = :svc AND effective_date <= CURRENT_DATE
                ORDER BY threshold_name, effective_date DESC
            """),
            {"svc": SERVICE_NAME},
        ).fetchall()
    return {r[0]: float(r[1]) for r in rows}


def _load_peer_data(naics_prefix: str, size_band: str) -> list[dict[str, Any]]:
    """
    Load peer ratio profiles from Cloud SQL for the given NAICS prefix and size band.
    Falls back to the 'fallback' sector row when no exact match is found.
    """
    with _get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT naics_prefix, size_band, dscr, leverage, current_ratio, ebitda_margin
                FROM peer_profiles
                WHERE (
                    (naics_prefix = :naics_prefix AND size_band = :size_band)
                    OR naics_prefix = 'fallback'
                )
                AND effective_date <= CURRENT_DATE
                ORDER BY
                    CASE WHEN naics_prefix = :naics_prefix AND size_band = :size_band THEN 0 ELSE 1 END,
                    effective_date DESC
            """),
            {"naics_prefix": naics_prefix, "size_band": size_band},
        ).fetchall()
    return [
        {
            "dscr": float(row[2]),
            "leverage": float(row[3]),
            "current_ratio": float(row[4]),
            "ebitda_margin": float(row[5]),
            "_naics_prefix": row[0],
            "_size_band": row[1],
        }
        for row in rows
    ]



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

def resolve_naics_prefix(naics_code: str) -> str:
    """Return the 2-character sector prefix used to key the peer table."""
    return str(naics_code).strip()[:2]


def select_peer_group(
    naics_code: str,
    size_band: str,
    peer_data: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    """
    Return (peers, is_exact_match) from pre-loaded peer_data.
    Falls back to rows tagged as 'fallback' when no sector match is found.
    """
    prefix = resolve_naics_prefix(naics_code)
    band = size_band.lower()

    exact = [
        p for p in peer_data
        if p.get("_naics_prefix") == prefix and p.get("_size_band") == band
    ]
    if exact:
        return [{k: v for k, v in p.items() if not k.startswith("_")} for p in exact], True

    # Try any size band for this sector
    sector_any = [p for p in peer_data if p.get("_naics_prefix") == prefix]
    if sector_any:
        return [{k: v for k, v in p.items() if not k.startswith("_")} for p in sector_any], False

    # Fall back to generic fallback rows
    fallback = [p for p in peer_data if p.get("_naics_prefix") == "fallback"]
    clean = [{k: v for k, v in p.items() if not k.startswith("_")} for p in fallback]
    return clean, False


def compute_percentile_rank(value: float, peer_values: list[float]) -> float:
    """
    Return the fraction of peer values strictly below the borrower value,
    expressed as a 0-100 percentile rank, rounded to 1 decimal.
    """
    if not peer_values:
        return 50.0
    below = sum(1 for p in peer_values if p < value)
    return round(below / len(peer_values) * 100, 1)


def compute_ratio_percentiles(
    borrower_ratios: dict[str, float],
    peers: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """
    For each ratio present in borrower_ratios that is also in SUPPORTED_RATIOS,
    compute: borrower_value, peer_median, peer_p25, peer_p75, percentile_rank.
    """
    result: dict[str, dict[str, Any]] = {}

    for ratio_name, borrower_value in borrower_ratios.items():
        if ratio_name not in SUPPORTED_RATIOS:
            continue

        peer_values = sorted(
            p[ratio_name] for p in peers if ratio_name in p
        )

        if not peer_values:
            continue

        def percentile_of_sorted(sorted_vals: list[float], p: float) -> float:
            """Linear interpolation percentile on a sorted list (0-indexed)."""
            idx = p / 100 * (len(sorted_vals) - 1)
            lo = int(idx)
            hi = min(lo + 1, len(sorted_vals) - 1)
            frac = idx - lo
            return round(sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo]), 4)

        result[ratio_name] = {
            "borrower_value": borrower_value,
            "peer_median": percentile_of_sorted(peer_values, 50),
            "peer_p25": percentile_of_sorted(peer_values, 25),
            "peer_p75": percentile_of_sorted(peer_values, 75),
            "percentile_rank": compute_percentile_rank(
                float(borrower_value), [float(v) for v in peer_values]
            ),
        }

    return result


def build_peer_set(
    peers: list[dict[str, Any]], naics_code: str, size_band: str, is_exact: bool
) -> list[dict[str, Any]]:
    """Annotate each peer profile with an id and the match metadata."""
    prefix = resolve_naics_prefix(naics_code)
    return [
        {
            "peer_id": f"PEER-{prefix.upper()}-{size_band.upper()}-{i + 1:02d}",
            "naics_prefix": prefix,
            "size_band": size_band,
            "exact_match": is_exact,
            "ratios": peer,
        }
        for i, peer in enumerate(peers)
    ]


def validate_inputs(payload: dict[str, Any]) -> None:
    required = ["borrower_naics", "borrower_size_band", "borrower_ratios"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValueError(f"missing required fields: {missing}")

    size_band = str(payload["borrower_size_band"]).lower()
    if size_band not in VALID_SIZE_BANDS:
        raise ValueError(
            f"borrower_size_band must be one of {sorted(VALID_SIZE_BANDS)}, got '{size_band}'"
        )

    ratios = payload["borrower_ratios"]
    if not isinstance(ratios, dict):
        raise ValueError("borrower_ratios must be a JSON object of ratio_name -> value")

    if not ratios:
        raise ValueError("borrower_ratios must contain at least one ratio")


def process(payload: dict[str, Any]) -> dict[str, Any]:
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        # Thresholds loaded from Cloud SQL — never hardcoded
        _load_thresholds()

        validate_inputs(payload)

        naics_code = str(payload["borrower_naics"])
        size_band = str(payload["borrower_size_band"]).lower()
        borrower_ratios: dict[str, float] = {
            k: float(v) for k, v in payload["borrower_ratios"].items()
        }

        naics_prefix = resolve_naics_prefix(naics_code)
        peer_data = _load_peer_data(naics_prefix, size_band)
        peers_raw, is_exact = select_peer_group(naics_code, size_band, peer_data)
        peer_set = build_peer_set(peers_raw, naics_code, size_band, is_exact)
        ratio_percentiles = compute_ratio_percentiles(borrower_ratios, peers_raw)

        span.set_attribute("service.name", SERVICE_NAME)
        span.set_attribute("context_id", str(payload.get("context_id", "")))

        return {
            "peer_set": peer_set,
            "ratio_percentiles": ratio_percentiles,
            "context_id": payload.get("context_id"),
            "borrower_id": payload.get("borrower_id"),
            "naics_code": naics_code,
            "size_band": size_band,
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
            "benchmark_complete",
            extra={
                "context_id": payload.get("context_id"),
                "naics_code": payload.get("borrower_naics"),
                "size_band": payload.get("borrower_size_band"),
                "peer_count": len(result.get("peer_set", [])),
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
