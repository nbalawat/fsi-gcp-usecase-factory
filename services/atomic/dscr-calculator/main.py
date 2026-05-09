"""
dscr-calculator: Compute Debt Service Coverage Ratio under base and stress scenarios.

Inputs:  spread_income_statement, loan_terms, scenarios
Outputs: dscr_base, dscr_stressed, min_dscr_breach

DSCR = Net Operating Income / Total Debt Service
     = (EBITDA - CapEx) / (Annual Principal + Interest Payments)

Stateless. No model calls. Thresholds read from Cloud SQL at request time.
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

SERVICE_NAME = "dscr-calculator"

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


# ── Core computation (pure functions — easy to unit test) ──────────────────


def compute_dscr(ebitda: float, capex: float, annual_debt_service: float) -> float | None:
    """
    Compute DSCR = (EBITDA - CapEx) / Annual Debt Service.

    CapEx is typically a negative number (cash outflow); callers may pass either sign.
    We normalise: NOI = EBITDA - abs(capex), so CapEx always reduces NOI.

    Returns None when annual_debt_service is zero (undefined ratio).
    """
    if annual_debt_service == 0:
        return None
    noi = ebitda - abs(capex)
    return round(noi / annual_debt_service, 4)


def apply_scenario(income_statement: dict[str, Any], scenario: dict[str, Any]) -> dict[str, Any]:
    """
    Apply a stress scenario to the spread income statement.

    Supported scenario keys (all optional, all multiplicative unless noted):
      - revenue_shock       : factor applied to revenue (e.g. 0.85 = 15 % decline)
      - ebitda_margin_delta : additive basis-point shift to EBITDA margin
                              (e.g. -0.05 shaves 5 pp off the margin)
      - capex_multiplier    : factor applied to capex (e.g. 1.20 = 20 % higher spend)
      - rate_shock_bps      : additional basis points of interest, recalculated via
                              total_debt * (bps/10000) and added to capex-equivalent
                              NOI reduction (applied as a separate deduction)

    Returns a new income-statement dict with stressed values.
    """
    stressed = dict(income_statement)

    revenue = float(income_statement.get("revenue", 0))
    ebitda = float(income_statement.get("ebitda", 0))
    capex = float(income_statement.get("capex", 0))

    # Revenue shock
    revenue_shock = float(scenario.get("revenue_shock", 1.0))
    stressed_revenue = revenue * revenue_shock

    # Derive stressed EBITDA: preserve base margin then apply delta
    base_ebitda_margin = ebitda / revenue if revenue else 0
    margin_delta = float(scenario.get("ebitda_margin_delta", 0.0))
    stressed_margin = base_ebitda_margin + margin_delta
    # Floor margin at zero — can't be negative from margin alone
    stressed_margin = max(stressed_margin, 0.0)
    stressed_ebitda = stressed_revenue * stressed_margin

    # CapEx shock
    capex_multiplier = float(scenario.get("capex_multiplier", 1.0))
    stressed_capex = capex * capex_multiplier  # capex is negative, so larger abs = more stressed

    stressed["revenue"] = round(stressed_revenue, 2)
    stressed["ebitda"] = round(stressed_ebitda, 2)
    stressed["capex"] = round(stressed_capex, 2)
    stressed["_scenario_name"] = scenario.get("name", "unnamed")

    return stressed


def _annual_debt_service(loan_terms: dict[str, Any]) -> float:
    """
    Derive total annual debt service from loan_terms.

    Expects:
      - annual_principal_payment (or derives from loan_amount / term_years)
      - annual_interest_payment  (or derives from loan_amount * interest_rate)

    Falls back gracefully when individual fields are provided vs. computed.
    """
    # Explicit payments take priority
    if "annual_debt_service" in loan_terms:
        return float(loan_terms["annual_debt_service"])

    principal_payment = float(loan_terms.get("annual_principal_payment", 0))
    interest_payment = float(loan_terms.get("annual_interest_payment", 0))

    # Derive principal payment from loan amount + term if not supplied
    if principal_payment == 0:
        loan_amount = float(loan_terms.get("loan_amount", 0))
        term_years = float(loan_terms.get("term_years", 1))
        principal_payment = loan_amount / term_years if term_years else 0

    # Derive interest payment from loan amount + rate if not supplied
    if interest_payment == 0:
        loan_amount = float(loan_terms.get("loan_amount", 0))
        interest_rate = float(loan_terms.get("interest_rate", 0))
        interest_payment = loan_amount * interest_rate

    return principal_payment + interest_payment


def validate_inputs(payload: dict[str, Any]) -> None:
    """Raise ValueError for missing or malformed required fields."""
    required = ["spread_income_statement", "loan_terms", "scenarios"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValueError(f"missing required fields: {missing}")

    sis = payload["spread_income_statement"]
    if not isinstance(sis, dict):
        raise ValueError("spread_income_statement must be an object")

    lt = payload["loan_terms"]
    if not isinstance(lt, dict):
        raise ValueError("loan_terms must be an object")

    scens = payload["scenarios"]
    if not isinstance(scens, list):
        raise ValueError("scenarios must be a list")

    # income statement must carry ebitda
    if "ebitda" not in sis:
        raise ValueError("spread_income_statement must contain 'ebitda'")


def process(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Core orchestration function.

    Returns:
      dscr_base        — DSCR computed from base spread_income_statement
      dscr_stressed    — dict of {scenario_name: dscr} for every scenario
      min_dscr_breach  — True if ANY scenario (or base) DSCR < dscr_pass_threshold
    """
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        thresholds = _load_thresholds()
        dscr_pass_threshold = float(thresholds.get("dscr_pass_threshold", 1.25))

        validate_inputs(payload)

        sis = payload["spread_income_statement"]
        loan_terms = payload["loan_terms"]
        scenarios = payload["scenarios"]

        ebitda = float(sis["ebitda"])
        capex = float(sis.get("capex", 0))
        ads = _annual_debt_service(loan_terms)

        # Base DSCR
        dscr_base = compute_dscr(ebitda, capex, ads)

        # Stressed DSCRs — one per scenario
        dscr_stressed: dict[str, float | None] = {}
        for scenario in scenarios:
            stressed_sis = apply_scenario(sis, scenario)
            scenario_name = scenario.get("name", f"scenario_{scenarios.index(scenario)}")

            # Allow scenario to override debt service (e.g., rate shock increases payments)
            stressed_ads = ads
            rate_shock_bps = float(scenario.get("rate_shock_bps", 0))
            if rate_shock_bps:
                loan_amount = float(loan_terms.get("loan_amount", 0))
                stressed_ads = ads + loan_amount * (rate_shock_bps / 10_000)

            stressed_ebitda = float(stressed_sis["ebitda"])
            stressed_capex = float(stressed_sis["capex"])
            dscr_stressed[scenario_name] = compute_dscr(stressed_ebitda, stressed_capex, stressed_ads)

        # Determine breach: any DSCR (base or stressed) below pass threshold
        all_dscr_values: list[float] = []
        if dscr_base is not None:
            all_dscr_values.append(dscr_base)
        all_dscr_values.extend(v for v in dscr_stressed.values() if v is not None)

        min_dscr = min(all_dscr_values) if all_dscr_values else None
        min_dscr_breach = bool(min_dscr is not None and min_dscr < dscr_pass_threshold)

        span.set_attribute("service.name", SERVICE_NAME)
        span.set_attribute("context_id", str(payload.get("context_id", "")))

        return {
            "dscr_base": dscr_base,
            "dscr_stressed": dscr_stressed,
            "min_dscr_breach": min_dscr_breach,
            "min_dscr": min_dscr,
            "dscr_pass_threshold": dscr_pass_threshold,
            "context_id": payload.get("context_id"),
            "borrower_id": payload.get("borrower_id"),
            "period": payload.get("period"),
        }


# ── Cloud Run entry point ──────────────────────────────────────────────────


@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    payload: dict[str, Any] = {}
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        payload = request.get_json(force=True) or {}
        result = process(payload)
        logger.info(
            "dscr_calculated",
            extra={
                "context_id": payload.get("context_id"),
                "dscr_base": result.get("dscr_base"),
                "min_dscr_breach": result.get("min_dscr_breach"),
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
