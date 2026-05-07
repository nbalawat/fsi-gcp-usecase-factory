"""
financial-spreader: parse extracted financials into standardised spread ratios.

Atomic service — stateless, sophisticated financial computation.
Policy warning bands come from Cloud SQL; spread algorithms live in this service.
Called by Cloud Workflows via HTTP POST.

Inputs:  income_statement, balance_sheet, cash_flow
Outputs: spread_income_statement, spread_balance_sheet, spread_cash_flow, ratios
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

SERVICE_NAME = "financial-spreader"

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

    Returns warning band cutoffs for ratio quality classification.
    Spread algorithms (the math) stay in this service.
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


# ── Core computation (pure functions — easy to unit test) ──────────────────

def spread_income_statement(raw: dict[str, Any]) -> dict[str, Any]:
    rev = float(raw.get("revenue", 0))
    cogs = float(raw.get("cogs", 0))
    gross = rev - cogs
    ebitda = float(raw.get("ebitda", gross * 0.20))
    interest = float(raw.get("interest_expense", 0))
    net_income = float(raw.get("net_income", 0))
    da = float(raw.get("depreciation_amortization", ebitda - (net_income + interest)))

    return {
        "revenue": rev,
        "cogs": cogs,
        "gross_profit": gross,
        "gross_margin": round(gross / rev, 4) if rev else 0.0,
        "ebitda": ebitda,
        "ebitda_margin": round(ebitda / rev, 4) if rev else 0.0,
        "depreciation_amortization": da,
        "ebit": ebitda - da,
        "interest_expense": interest,
        "net_income": net_income,
        "net_margin": round(net_income / rev, 4) if rev else 0.0,
    }


def spread_balance_sheet(raw: dict[str, Any]) -> dict[str, Any]:
    total_assets = float(raw.get("total_assets", 0))
    total_debt = float(raw.get("total_debt", 0))
    total_equity = float(raw.get("total_equity", total_assets - total_debt))
    current_assets = float(raw.get("current_assets", 0))
    current_liabilities = float(raw.get("current_liabilities", 0))
    cash = float(raw.get("cash_and_equivalents", 0))
    inventory = float(raw.get("inventory", 0))
    receivables = float(raw.get("accounts_receivable", 0))

    return {
        "total_assets": total_assets,
        "total_debt": total_debt,
        "total_equity": total_equity,
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "working_capital": current_assets - current_liabilities,
        "cash_and_equivalents": cash,
        "accounts_receivable": receivables,
        "inventory": inventory,
        "leverage_ratio": round(total_debt / total_equity, 4) if total_equity else None,
        "current_ratio": round(current_assets / current_liabilities, 4) if current_liabilities else None,
        "quick_ratio": round((current_assets - inventory) / current_liabilities, 4) if current_liabilities else None,
    }


def spread_cash_flow(raw: dict[str, Any]) -> dict[str, Any]:
    operating_cf = float(raw.get("operating_cash_flow", 0))
    capex = float(raw.get("capex", 0))
    fcf = operating_cf + capex  # capex is usually negative

    return {
        "operating_cash_flow": operating_cf,
        "capex": capex,
        "free_cash_flow": fcf,
        "fcf_margin": None,  # caller enriches once revenue is known
    }


def compute_ratios(
    income: dict[str, Any],
    balance: dict[str, Any],
    cash_flow: dict[str, Any],
    periods: int,
) -> dict[str, Any]:
    ebitda = income.get("ebitda", 0)
    total_debt = balance.get("total_debt", 0)
    total_equity = balance.get("total_equity", 1)
    revenue = income.get("revenue", 0)
    fcf = cash_flow.get("free_cash_flow", 0)

    return {
        "debt_to_ebitda": round(total_debt / ebitda, 2) if ebitda else None,
        "debt_to_equity": round(total_debt / total_equity, 2) if total_equity else None,
        "return_on_assets": round(income.get("net_income", 0) / balance.get("total_assets", 1), 4),
        "return_on_equity": round(income.get("net_income", 0) / total_equity, 4) if total_equity else None,
        "asset_turnover": round(revenue / balance.get("total_assets", 1), 4),
        "fcf_to_debt": round(fcf / total_debt, 4) if total_debt else None,
        "periods_analysed": periods,
    }


def classify_ratio_quality(ratios: dict[str, Any], thresholds: dict[str, Any]) -> dict[str, str]:
    """Classify each key ratio as 'strong' | 'adequate' | 'weak' against Cloud SQL cutoffs.

    Thresholds govern the band labels; the ratio math above is the algorithm.
    """
    quality: dict[str, str] = {}

    dte = ratios.get("debt_to_ebitda")
    if dte is not None:
        weak_dte = thresholds.get("debt_to_ebitda_weak", 6.0)
        strong_dte = thresholds.get("debt_to_ebitda_strong", 3.0)
        quality["debt_to_ebitda"] = "weak" if dte >= weak_dte else "strong" if dte <= strong_dte else "adequate"

    roa = ratios.get("return_on_assets")
    if roa is not None:
        strong_roa = thresholds.get("return_on_assets_strong", 0.05)
        weak_roa = thresholds.get("return_on_assets_weak", 0.01)
        quality["return_on_assets"] = "strong" if roa >= strong_roa else "weak" if roa < weak_roa else "adequate"

    return quality


def validate_inputs(payload: dict[str, Any]) -> None:
    required = ["income_statement", "balance_sheet", "cash_flow"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValueError(f"missing required fields: {missing}")
    if not isinstance(payload["income_statement"], dict):
        raise ValueError("income_statement must be an object")
    if not isinstance(payload["balance_sheet"], dict):
        raise ValueError("balance_sheet must be an object")


def process(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Inputs:  income_statement, balance_sheet, cash_flow, prior_periods (optional)
    Outputs: spread_income_statement, spread_balance_sheet, spread_cash_flow, ratios, ratio_quality

    Audit is written to Cloud SQL in a try/finally so failures are captured too.
    """
    context_id = payload.get("context_id", "unknown")
    result: dict[str, Any] = {}
    error_msg: str | None = None
    try:
        with tracer.start_as_current_span(SERVICE_NAME) as span:
            validate_inputs(payload)
            span.set_attribute("service.name", SERVICE_NAME)
            span.set_attribute("context_id", context_id)

            thresholds = _load_thresholds()

            periods = len(payload.get("prior_periods", [])) + 1
            income = spread_income_statement(payload["income_statement"])
            balance = spread_balance_sheet(payload["balance_sheet"])
            cash_flow_raw = payload.get("cash_flow", {})
            cash_flow = spread_cash_flow(cash_flow_raw)

            if income["revenue"]:
                cash_flow["fcf_margin"] = round(cash_flow["free_cash_flow"] / income["revenue"], 4)

            ratios = compute_ratios(income, balance, cash_flow, periods)
            ratio_quality = classify_ratio_quality(ratios, thresholds)

            result = {
                "spread_income_statement": income,
                "spread_balance_sheet": balance,
                "spread_cash_flow": cash_flow,
                "ratios": ratios,
                "ratio_quality": ratio_quality,
                "context_id": context_id,
                "borrower_id": payload.get("borrower_id"),
                "period": payload.get("period"),
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
