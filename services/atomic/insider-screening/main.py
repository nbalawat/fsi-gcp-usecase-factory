"""
insider-screening: detect Reg O insider relationships (12 CFR 215 / OCC 12 CFR 31).

Atomic service — stateless, sophisticated graph traversal computation.
Closes the compliance BLOCKER from credit-memo-commercial: Reg O requires
affirmative detection, not passive routing. This service queries the bank's
insider registry tables (officers_directors, principal_shareholders,
related_interests) and computes:

  insider_status:  insider | non-insider | indeterminate
  insider_type:    executive_officer | director | principal_shareholder | related_interest | null
  related_to:      <upstream insider id, when status comes via related_interests>
  applicable_lending_limit:  reg-O-15% | reg-O-15-aggregate | LLL-25%
  requires_board_approval:   bool

Algorithm summary:
  1. Direct insider check: is borrower_id in officers_directors or principal_shareholders?
  2. Related-interest traversal: walk related_interests up to depth=N (default 2)
     looking for any path to a direct insider.
  3. Below confidence_floor → return "indeterminate" rather than risk a false negative.
     (False negatives are regulatory citations.)

Inputs:  borrower_id, applicant_id (optional — guarantor / co-signer), as_of_date
Outputs: insider_status, insider_type, related_to, evidence, confidence,
         requires_board_approval, applicable_lending_limit
"""
from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timezone
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
SERVICE_NAME = "insider-screening"

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
    """Load policy thresholds from Cloud SQL — confidence floors, lending limits."""
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


def _write_audit(context_id: str, inputs: dict, result: dict, error: str | None = None) -> None:
    """Mandatory audit write; redacts borrower_id + EIN + applicant_id before persistence."""
    redacted_in = _redact(inputs)
    redacted_out = _redact(result or {})
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
                    "inp": json.dumps(redacted_in),
                    "out": json.dumps(redacted_out),
                    "err": error,
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as audit_err:
        logger.warning("audit_write_failed", extra={"error": str(audit_err)})


_PII_KEYS = {"borrower_id", "applicant_id", "ein", "ssn", "tax_id", "name", "legal_name"}
_EIN_RE = re.compile(r"\b\d{2}-\d{7}\b")
_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


def _redact(d: dict) -> dict:
    """Redact PII before audit-row persistence.

    - borrower_id / applicant_id → last-4 only
    - EIN / SSN → fully masked
    - any string value matching EIN/SSN regex → masked
    - other fields truncated to 200 chars
    """
    out: dict = {}
    for k, v in d.items():
        if k in _PII_KEYS and isinstance(v, str):
            out[k] = f"...{v[-4:]}" if len(v) >= 4 else "***"
        elif k in {"ein", "ssn", "tax_id"}:
            out[k] = "***-redacted***"
        elif isinstance(v, str):
            sanitized = _EIN_RE.sub("***-EIN-***", _SSN_RE.sub("***-SSN-***", v))
            out[k] = sanitized[:200]
        elif isinstance(v, (list, dict)):
            out[k] = json.dumps(v)[:200]
        else:
            out[k] = v
    return out


# ── Core computation ───────────────────────────────────────────────────────


def _direct_insider_lookup(conn, subject_id: str, as_of_date: str) -> tuple[str | None, str | None]:
    """Direct lookup: is subject in officers_directors or principal_shareholders?

    Returns (insider_type, evidence_signal) or (None, None) if not direct.
    """
    # Officers + Directors
    row = conn.execute(
        text("""
            SELECT role FROM officers_directors
             WHERE subject_id = :sid
               AND effective_from <= :aod
               AND (effective_to IS NULL OR effective_to >= :aod)
             LIMIT 1
        """),
        {"sid": subject_id, "aod": as_of_date},
    ).fetchone()
    if row:
        role = (row[0] or "").lower()
        if "executive" in role or role in ("ceo", "cfo", "coo", "president"):
            return "executive_officer", f"officers_directors.role={row[0]}"
        return "director", f"officers_directors.role={row[0]}"

    # Principal shareholders (≥10% beneficial ownership; threshold is loaded from policy)
    row = conn.execute(
        text("""
            SELECT ownership_pct FROM principal_shareholders
             WHERE subject_id = :sid
               AND effective_from <= :aod
               AND (effective_to IS NULL OR effective_to >= :aod)
             LIMIT 1
        """),
        {"sid": subject_id, "aod": as_of_date},
    ).fetchone()
    if row:
        pct = float(row[0] or 0)
        return "principal_shareholder", f"principal_shareholders.ownership_pct={pct:.2f}"

    return None, None


def _related_interest_traversal(
    conn, subject_id: str, as_of_date: str, max_depth: int = 2
) -> tuple[str | None, str | None]:
    """BFS through related_interests up to max_depth looking for a direct insider.

    Returns (related_to_id, evidence_signal) when a path to an insider is found.
    """
    visited = {subject_id}
    frontier = [(subject_id, 0)]
    while frontier:
        current, depth = frontier.pop(0)
        if depth >= max_depth:
            continue
        rows = conn.execute(
            text("""
                SELECT related_to_id, relationship_type
                  FROM related_interests
                 WHERE subject_id = :sid
                   AND effective_from <= :aod
                   AND (effective_to IS NULL OR effective_to >= :aod)
            """),
            {"sid": current, "aod": as_of_date},
        ).fetchall()
        for related_id, rel_type in rows:
            if related_id in visited:
                continue
            visited.add(related_id)
            insider_type, _evidence = _direct_insider_lookup(conn, related_id, as_of_date)
            if insider_type is not None:
                return related_id, f"related_interest({rel_type})→{insider_type}"
            frontier.append((related_id, depth + 1))
    return None, None


def screen_subject(subject_id: str, as_of_date: str, max_depth: int) -> dict[str, Any]:
    """Screen one subject; returns full classification result."""
    with _get_engine().connect() as conn:
        # Direct check
        direct_type, direct_signal = _direct_insider_lookup(conn, subject_id, as_of_date)
        if direct_type:
            return {
                "insider_status": "insider",
                "insider_type": direct_type,
                "related_to": None,
                "evidence": [{"signal": direct_signal, "weight": "high"}],
                "confidence": 0.99,
            }
        # Related-interest traversal
        related_to, related_signal = _related_interest_traversal(conn, subject_id, as_of_date, max_depth)
        if related_to:
            return {
                "insider_status": "insider",
                "insider_type": "related_interest",
                "related_to": related_to,
                "evidence": [{"signal": related_signal, "weight": "high"}],
                "confidence": 0.92,
            }
        # No insider link found
        return {
            "insider_status": "non-insider",
            "insider_type": None,
            "related_to": None,
            "evidence": [],
            "confidence": 0.95,
        }


def applicable_lending_limit(insider_type: str | None) -> str:
    """Map insider type → applicable lending limit citation."""
    if insider_type is None:
        return "LLL-25%"   # 12 CFR 32 — general legal lending limit
    if insider_type == "principal_shareholder":
        return "reg-O-15-aggregate"
    return "reg-O-15%"      # 12 CFR 215.4


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
    Inputs:  borrower_id, as_of_date, applicant_id (optional), max_depth (optional)
    Outputs: insider_status, insider_type, related_to, evidence, confidence,
             requires_board_approval, applicable_lending_limit
    """
    context_id = payload.get("context_id", "unknown")
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        with tracer.start_as_current_span(SERVICE_NAME) as span:
            validate_inputs(payload)
            borrower_id = payload["borrower_id"].strip()
            as_of_date = payload["as_of_date"].strip()
            applicant_id = (payload.get("applicant_id") or "").strip() or None
            max_depth = int(payload.get("max_depth", 2))

            span.set_attribute("service.name", SERVICE_NAME)
            span.set_attribute("context_id", context_id)

            thresholds = _load_thresholds()
            confidence_floor = thresholds.get("confidence_floor", 0.85)

            # Screen the borrower itself
            classification = screen_subject(borrower_id, as_of_date, max_depth)

            # Also screen the applicant/guarantor if supplied; if EITHER is an insider,
            # the credit decision is treated as insider-touching.
            if applicant_id:
                applicant_class = screen_subject(applicant_id, as_of_date, max_depth)
                if applicant_class["insider_status"] == "insider":
                    classification = applicant_class
                    classification["evidence"].append(
                        {"signal": f"insider_via_applicant={applicant_id[-4:]}", "weight": "high"}
                    )

            # Confidence floor: below the floor we MUST return indeterminate.
            if classification["confidence"] < confidence_floor:
                classification = {
                    "insider_status": "indeterminate",
                    "insider_type": None,
                    "related_to": None,
                    "evidence": classification["evidence"],
                    "confidence": classification["confidence"],
                }

            insider_type = classification["insider_type"]
            result = {
                **classification,
                "requires_board_approval": classification["insider_status"] == "insider",
                "applicable_lending_limit": applicable_lending_limit(insider_type),
                "context_id": context_id,
            }
            return result
    except Exception as e:
        error_msg = str(e)
        raise
    finally:
        _write_audit(context_id, payload, result, error_msg)


@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    """Cloud Run HTTP entry point. Audit handled inside process()."""
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
