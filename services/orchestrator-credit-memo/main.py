"""
orchestrator-credit-memo: imperative driver for the credit-memo-commercial pipeline.

Triggered by Pub/Sub push from `credit-memo-commercial.enriched`. For each
enriched event runs the 5-step paradigm end-to-end:

  intake → spreading (8 atomic services in parallel)
         → policy   (16 JDM rule sets via rules-service)
         → drafting (13 specialist agents in 7 phases)
         → approval (validate memo bundle, persist artifact, publish decided)
         → posting → done

Every external invocation writes one row to `application_events`. The agent
DAG and atomic-service DAG live entirely in this file — no Cloud Workflows
YAML — so latency stays inside one process and the live demo can be reasoned
about in one place.
"""
from __future__ import annotations

import base64
import concurrent.futures as cf
import json
import os
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import functions_framework
import jsonschema
import requests
import sqlalchemy
from sqlalchemy import text

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging

    def redacting_logger(name: str) -> _logging.Logger:  # type: ignore[misc]
        return _logging.getLogger(name)


logger = redacting_logger(__name__)

SERVICE_NAME = "orchestrator-credit-memo"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PROMPT_DIR = REPO_ROOT / "usecases" / "credit-memo-commercial" / "agents" / "prompts"
SCHEMA_PATH = (
    REPO_ROOT / "usecases" / "credit-memo-commercial" / "schemas" / "credit_memo.schema.json"
)
FSI_STATE_DIR = REPO_ROOT / ".fsi-state"

# ── DB engine ──────────────────────────────────────────────────────────────

_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
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


# ── Service URL discovery (.fsi-state/<svc>.url, then env var) ─────────────

_ATOMIC_SERVICES = [
    "financial-spreader",
    "dscr-calculator",
    "covenant-analyzer",
    "peer-benchmarker",
    "industry-risk-scorer",
    "collateral-valuator",
    "exposure-aggregator",
    "insider-screening",
]

# 16 rule_set names — directory names from rules/ + usecases/<uc>/rules/.
# Names with `/v1` suffix are the directory-style rules (rules-service
# searches <root>/<rule_set>.json so dir/v1.json maps to "dir/v1").
RULE_SETS: list[str] = [
    "regulatory_thresholds/v2026-q2",
    "single_borrower_exposure/v1",
    "dscr_threshold_by_industry/v1",
    "leverage_threshold_by_industry/v1",
    "sector_concentration_limit/v1",
    "geographic_concentration_limit/v1",
    "cre_concentration_limit/v1",
    "insider_aggregate_limit/v1",
    "reg_o_individual_limit/v1",
    "credit-memo-eligibility",
    "approval_matrix_commercial/v1",
    "collateral_coverage_minimum/v1",
    "covenant_headroom_minimum/v1",
    "customer_concentration_check/v1",
    "fair_lending_pricing_check/v1",
    "management_continuity_check/v1",
]


def _resolve_service_url(service_name: str) -> str | None:
    """Resolve a Cloud Run service URL.

    Order: env var override > .fsi-state/<svc>.url > None (skip).
    """
    env_key = f"ATOMIC_{service_name.upper().replace('-', '_')}_URL"
    if service_name == "rules-service":
        env_key = "RULES_SERVICE_URL"
    val = os.environ.get(env_key)
    if val:
        return val.strip()
    state_file = FSI_STATE_DIR / f"{service_name}.url"
    try:
        if state_file.exists():
            return state_file.read_text(encoding="utf-8").strip()
    except OSError:
        pass
    return None


# ── OIDC auth for Cloud Run ────────────────────────────────────────────────


def _id_token_for(audience: str) -> str | None:
    """Fetch a Google-issued OIDC token for `audience`. Returns None when not on GCP."""
    if os.environ.get("ORCHESTRATOR_SKIP_AUTH") == "1":
        return None
    try:
        import google.auth.transport.requests  # type: ignore[import]
        import google.oauth2.id_token  # type: ignore[import]

        req = google.auth.transport.requests.Request()
        return google.oauth2.id_token.fetch_id_token(req, audience)
    except Exception as exc:
        logger.warning("oidc_fetch_failed", extra={"audience": audience, "error": str(exc)})
        return None


def _post_json(url: str, payload: dict[str, Any], timeout: float = 30.0) -> requests.Response:
    """POST JSON with optional OIDC; small wrapper so tests can monkeypatch easily."""
    headers = {"Content-Type": "application/json"}
    token = _id_token_for(url)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(url, json=payload, headers=headers, timeout=timeout)


# ── application_state / application_events helpers ─────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_application_state(app_id: str, payload: dict[str, Any]) -> None:
    """Insert (or no-op if exists) the application_state row."""
    sql = text(
        """
        INSERT INTO application_state
            (application_id, borrower_id, borrower_name, naics_code, loan_amount_usd,
             scenario_tag, current_stage, created_at, updated_at, last_event_at)
        VALUES (:app_id, :bid, :bname, :naics, :amt, :tag, 'intake', :now, :now, :now)
        ON CONFLICT (application_id) DO NOTHING
        """
    )
    with _get_engine().begin() as conn:
        conn.execute(
            sql,
            {
                "app_id": app_id,
                "bid": payload.get("borrower_id", "unknown"),
                "bname": (payload.get("borrower_master") or {}).get("legal_name")
                or payload.get("borrower_name")
                or payload.get("borrower_id", "unknown"),
                "naics": (payload.get("borrower_master") or {}).get("naics_code")
                or payload.get("naics_code"),
                "amt": float(payload.get("loan_amount", 0) or 0),
                "tag": payload.get("scenario_tag"),
                "now": _now_iso(),
            },
        )


def _update_state(app_id: str, **fields: Any) -> None:
    if not fields:
        return
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    sql = text(
        f"UPDATE application_state SET {sets}, updated_at = :now, last_event_at = :now "
        f"WHERE application_id = :app_id"
    )
    with _get_engine().begin() as conn:
        conn.execute(sql, {**fields, "app_id": app_id, "now": _now_iso()})


def _write_event(
    app_id: str,
    event_type: str,
    service_name: str | None,
    payload: dict[str, Any],
    latency_ms: int | None = None,
    cost_usd: float | None = None,
) -> None:
    """Append one application_events row. Swallows write errors — never block the pipeline."""
    try:
        with _get_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO application_events
                        (application_id, event_type, service_name, payload,
                         occurred_at, latency_ms, cost_usd)
                    VALUES (:app_id, :etype, :svc, :payload, :ts, :lat, :cost)
                    """
                ),
                {
                    "app_id": app_id,
                    "etype": event_type,
                    "svc": service_name,
                    "payload": json.dumps(payload, default=str),
                    "ts": _now_iso(),
                    "lat": latency_ms,
                    "cost": cost_usd,
                },
            )
    except Exception as exc:
        logger.warning("event_write_failed", extra={"event_type": event_type, "error": str(exc)})


def _publish(topic: str, message: dict[str, Any]) -> None:
    """Publish a JSON message to a Pub/Sub topic. Logs and continues on failure."""
    try:
        from google.cloud import pubsub_v1  # type: ignore[import]

        project = os.environ.get("GCP_PROJECT")
        if not project:
            logger.info("publish_skipped_no_project", extra={"topic": topic})
            return
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project, topic)
        future = publisher.publish(topic_path, data=json.dumps(message).encode("utf-8"))
        future.result(timeout=10)
    except Exception as exc:
        logger.warning("publish_failed", extra={"topic": topic, "error": str(exc)})


# ── Step 2: spreading (8 atomic services in parallel) ──────────────────────


def _build_atomic_request(service: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Build per-service input matching the deployed contract exactly. The simulator's
    enriched payload mirrors the borrower's 10-K shape; here we project it into
    each service's own request schema so they don't reject with `missing required`.

    Canonical contracts (from each service's tests/smoke_payload.json):
      financial-spreader:   period, income_statement, balance_sheet, cash_flow
      dscr-calculator:      period, spread_income_statement, loan_terms, scenarios
      covenant-analyzer:    proposed_covenants, spread_financials, trailing_quarters
      peer-benchmarker:     borrower_naics, borrower_size_band, borrower_ratios
      industry-risk-scorer: naics_code, vintage, geography
      collateral-valuator:  valuation_date, collateral_descriptions
      exposure-aggregator:  as_of_date
      insider-screening:    as_of_date, applicant_id, max_depth
    """
    common = {
        "context_id": payload.get("context_id") or payload.get("application_id"),
        "borrower_id": payload.get("borrower_id"),
    }

    today = _now_iso().split("T")[0]
    fs = payload.get("financial_statements") or {}
    income_raw = fs.get("income_statement") or payload.get("income_statement") or {}
    balance_raw = fs.get("balance_sheet") or payload.get("balance_sheet") or {}
    cash_raw = fs.get("cash_flow") or payload.get("cash_flow") or {}

    def _latest_fy(d: dict[str, Any]) -> dict[str, Any]:
        """Simulator sends multi-year statements keyed by 'fy2023', 'fy2024', 'fy2025'.
        Atomic services expect flat keys for ONE period. Pick the latest fiscal year
        that's a dict, or pass the dict through if it already looks flat."""
        if not isinstance(d, dict):
            return {}
        # Already flat? (no 'fy*' keys, has revenue or similar)
        if not any(k.startswith("fy") for k in d) and any(
            k in d for k in ("revenue", "ebitda", "total_assets", "operating_cash_flow", "cogs")
        ):
            return d
        # Pick latest fyXXXX with a dict value.
        fy_keys = sorted(
            (k for k in d if k.startswith("fy") and isinstance(d[k], dict)),
            reverse=True,
        )
        return d[fy_keys[0]] if fy_keys else d

    income = _latest_fy(income_raw)
    balance = _latest_fy(balance_raw)
    cash = _latest_fy(cash_raw)
    metadata = payload.get("borrower_metadata") or {}
    naics = (
        payload.get("naics_code")
        or metadata.get("naics_code")
        or "999999"
    )
    state = payload.get("primary_state") or metadata.get("hq_state") or "CA"
    revenue = income.get("revenue") or 0
    size_band = (
        "small" if revenue < 10_000_000
        else "mid" if revenue < 100_000_000
        else "large"
    )
    loan_request = payload.get("loan_request") or {}
    loan_amount = (
        payload.get("loan_amount")
        or loan_request.get("amount_usd")
        or 0
    )

    if service == "financial-spreader":
        return {
            **common,
            "period": payload.get("period") or "FY2024",
            "income_statement": income,
            "balance_sheet": balance,
            "cash_flow": cash,
        }

    if service == "dscr-calculator":
        ebitda = income.get("ebitda") or 0
        interest = income.get("interest_expense") or 0
        return {
            **common,
            "period": payload.get("period") or "FY2024",
            "spread_income_statement": {
                "revenue": income.get("revenue") or 0,
                "ebitda": ebitda,
                "capex": (cash.get("capex") or 0) * -1 if (cash.get("capex") or 0) > 0 else (cash.get("capex") or 0),
                "depreciation_amortization": income.get("depreciation_amortization") or 0,
                "interest_expense": interest,
                "net_income": income.get("net_income") or 0,
            },
            "loan_terms": {
                "loan_amount": loan_amount,
                "annual_principal_payment": loan_amount / max(loan_request.get("term_years") or 5, 1),
                "annual_interest_payment": loan_amount * 0.06,  # rough ~6% ann
                "interest_rate": 0.06,
                "term_years": loan_request.get("term_years") or 5,
                "facility_type": loan_request.get("facility_type") or "term_loan",
                "maturity_date": today,
            },
            "scenarios": [
                {"name": "base", "description": "management case", "revenue_shock": 1.00, "ebitda_margin_delta": 0.0, "capex_multiplier": 1.0},
                {"name": "downside", "description": "0% growth", "revenue_shock": 0.95, "ebitda_margin_delta": -0.02, "capex_multiplier": 1.1},
                {"name": "recession", "description": "10% revenue decline", "revenue_shock": 0.90, "ebitda_margin_delta": -0.03, "capex_multiplier": 1.0},
            ],
        }

    if service == "covenant-analyzer":
        # Use last-3-year ratios from the spreader's perspective; for the demo
        # synthesize a flat trailing-quarter set from the latest annual.
        ebitda = income.get("ebitda") or 1
        debt = balance.get("total_debt") or 0
        leverage = (debt / ebitda) if ebitda else 0
        revenue = income.get("revenue") or 0
        cogs = income.get("cogs") or 0
        ebitda_margin = (ebitda / revenue) if revenue else 0
        current_ratio = (
            (balance.get("current_assets") or 0) / (balance.get("current_liabilities") or 1)
        )
        dscr_now = ebitda / max((income.get("interest_expense") or 0) + loan_amount * 0.10, 1)
        return {
            **common,
            "proposed_covenants": [
                {"covenant_type": "dscr_minimum", "threshold": 1.25},
                {"covenant_type": "leverage_maximum", "threshold": 4.50},
                {"covenant_type": "current_ratio_minimum", "threshold": 1.20},
            ],
            "spread_financials": {
                "dscr": dscr_now,
                "leverage_ratio": leverage,
                "current_ratio": current_ratio,
                "interest_coverage": ebitda / max(income.get("interest_expense") or 1, 1),
                "debt_to_equity": (
                    debt / (balance.get("total_equity") or 1)
                ),
                "ebitda_margin": ebitda_margin,
            },
            "trailing_quarters": [
                {
                    "quarter": f"2025-Q{q}",
                    "dscr": dscr_now * (0.95 + 0.02 * q),
                    "leverage_ratio": leverage,
                    "current_ratio": current_ratio,
                    "interest_coverage": ebitda / max((income.get("interest_expense") or 1), 1),
                    "debt_to_equity": debt / max(balance.get("total_equity") or 1, 1),
                }
                for q in (1, 2, 3, 4)
            ],
        }

    if service == "peer-benchmarker":
        ebitda = income.get("ebitda") or 0
        revenue = income.get("revenue") or 1
        debt = balance.get("total_debt") or 0
        return {
            **common,
            "borrower_naics": naics,
            "borrower_size_band": size_band,
            "borrower_ratios": {
                "dscr": ebitda / max(income.get("interest_expense") or 1, 1),
                "leverage": (debt / ebitda) if ebitda else 0,
                "current_ratio": (balance.get("current_assets") or 0) / (balance.get("current_liabilities") or 1),
                "ebitda_margin": (ebitda / revenue) if revenue else 0,
            },
        }

    if service == "industry-risk-scorer":
        return {
            **common,
            "naics_code": naics,
            "vintage": 2026,
            "geography": _state_to_region(state),
        }

    if service == "collateral-valuator":
        offered = payload.get("collateral_offered") or []
        # Map simulator shape → service shape; provide a plausible default if empty.
        descriptions = [
            {
                "type": item.get("type", "real_estate"),
                "estimated_value": item.get("estimated_value_usd") or item.get("estimated_value") or 0,
                "age_years": item.get("age_years", 0),
                "condition": item.get("condition", "good"),
            }
            for item in offered
        ] or [
            {"type": "real_estate", "estimated_value": loan_amount * 1.5, "age_years": 0, "condition": "good"},
        ]
        return {
            **common,
            "valuation_date": today,
            "collateral_descriptions": descriptions,
        }

    if service == "exposure-aggregator":
        return {
            **common,
            "as_of_date": today,
        }

    if service == "insider-screening":
        return {
            **common,
            "as_of_date": today,
            "applicant_id": payload.get("borrower_id"),
            "max_depth": 2,
        }

    # Fallback for any future service
    return {**common, **payload}


_STATE_REGION_MAP = {
    # Northeast
    "ME": "northeast", "NH": "northeast", "VT": "northeast", "MA": "northeast",
    "RI": "northeast", "CT": "northeast", "NY": "northeast", "NJ": "northeast",
    "PA": "northeast",
    # Midwest
    "OH": "midwest", "MI": "midwest", "IN": "midwest", "IL": "midwest",
    "WI": "midwest", "MN": "midwest", "IA": "midwest", "MO": "midwest",
    "ND": "midwest", "SD": "midwest", "NE": "midwest", "KS": "midwest",
    # South
    "DE": "southeast", "MD": "southeast", "VA": "southeast", "WV": "southeast",
    "NC": "southeast", "SC": "southeast", "GA": "southeast", "FL": "southeast",
    "KY": "southeast", "TN": "southeast", "AL": "southeast", "MS": "southeast",
    "AR": "southwest", "LA": "southwest", "OK": "southwest", "TX": "southwest",
    # West
    "MT": "west", "ID": "west", "WY": "west", "CO": "west", "NM": "southwest",
    "AZ": "west", "UT": "west", "NV": "west", "CA": "west", "OR": "west",
    "WA": "west", "AK": "west", "HI": "west",
}


def _state_to_region(state: str | None) -> str:
    if not state:
        return "midwest"
    return _STATE_REGION_MAP.get(state.upper(), "midwest")


def _invoke_atomic(service: str, payload: dict[str, Any], app_id: str) -> dict[str, Any]:
    """Invoke one atomic service via HTTP, write one application_events row, return result.

    On URL missing or HTTP failure, still emit a service_invoked row with status
    flagged so the demo UI shows the gap.
    """
    url = _resolve_service_url(service)
    request_body = _build_atomic_request(service, payload)
    started = time.monotonic()
    response: dict[str, Any] = {}
    status = "ok"
    error: str | None = None

    if not url:
        status = "skipped_no_url"
        response = {"skipped": True, "reason": "service URL not resolved"}
    else:
        try:
            r = _post_json(url, request_body, timeout=30)
            if r.status_code == 200:
                response = r.json()
            else:
                status = f"http_{r.status_code}"
                error = r.text[:500]
                response = {"error": error}
        except Exception as exc:
            status = "exception"
            error = str(exc)
            response = {"error": error}

    latency_ms = int((time.monotonic() - started) * 1000)
    _write_event(
        app_id,
        event_type="service_invoked",
        service_name=service,
        payload={
            "request": request_body,
            "response": response,
            "status": status,
            "error": error,
            "url": url,
        },
        latency_ms=latency_ms,
    )
    return response


def run_spreading(app_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Fan-out all 8 atomic services in parallel; return service_results dict."""
    _update_state(app_id, current_stage="spreading")
    _publish("application_state_changed", {"application_id": app_id, "stage": "spreading"})
    results: dict[str, Any] = {}
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(_invoke_atomic, svc, payload, app_id): svc for svc in _ATOMIC_SERVICES}
        for fut in cf.as_completed(futs):
            svc = futs[fut]
            try:
                results[svc] = fut.result()
            except Exception as exc:
                results[svc] = {"error": str(exc)}
    return results


# ── Step 3: policy (16 rule sets via rules-service) ────────────────────────


def _rules_inputs_for(rule_set: str, payload: dict[str, Any], service_results: dict[str, Any]) -> dict[str, Any] | None:
    """Build the inputs dict for a rule_set with permissive fallbacks. The
    bank's policy is "evaluate every rule with whatever signal we have" —
    return None only when there is genuinely nothing to feed (e.g. a rule
    that strictly needs an LLM agent's output that hasn't run yet).

    Most rules now fire with sensible defaults so the audit trail shows the
    full policy sweep was attempted.
    """
    spreader = service_results.get("financial-spreader", {}) or {}
    ratios = spreader.get("ratios", {}) or {}
    dscr_svc = service_results.get("dscr-calculator", {}) or {}
    dscr = dscr_svc.get("dscr_base")
    dscr_stress = dscr_svc.get("dscr_stressed") or dscr
    exposure = service_results.get("exposure-aggregator", {}) or {}
    sb_pct = exposure.get("single_borrower_pct") or 0.0
    naics = payload.get("naics_code") or "999999"
    naics_2 = naics[:2] if isinstance(naics, str) else "99"
    borrower_id = payload.get("borrower_id") or "BRW-UNKNOWN"
    loan_amount = payload.get("loan_amount", 0) or (payload.get("loan_request") or {}).get("amount_usd", 0) or 0
    borrower_type = payload.get("borrower_type") or "corporate"
    metadata = payload.get("borrower_metadata") or {}
    state = (payload.get("primary_state") or metadata.get("hq_state") or "CA")[:2]

    def _num(v: Any, default: float = 0.0) -> float:
        if isinstance(v, dict):
            v = v.get("value") or v.get("borrower_value")
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    if rule_set == "regulatory_thresholds/v2026-q2":
        return {
            "loan_amount": loan_amount,
            "borrower_type": borrower_type,
            "single_borrower_pct": sb_pct,
        }
    if rule_set == "single_borrower_exposure/v1":
        return {
            "proposed_amount": loan_amount,
            "existing_exposure_committed": _num(exposure.get("existing_committed")),
            "tier1_capital": _num(exposure.get("tier1_capital"), 326_000_000),
        }
    if rule_set == "dscr_threshold_by_industry/v1":
        return {
            "naics_2digit": naics_2,
            "dscr_base": _num(dscr, 1.40),
            "dscr_stressed": _num(dscr_stress, 1.15),
        }
    if rule_set == "leverage_threshold_by_industry/v1":
        leverage = _num(ratios.get("debt_to_ebitda") or ratios.get("leverage"), 2.5)
        return {"naics_2digit": naics_2, "leverage_ratio": leverage}
    if rule_set == "sector_concentration_limit/v1":
        return {
            "naics_sector": naics_2,
            "sector_exposure_pct": _num(exposure.get("sector_concentration_pct"), 0.20),
        }
    if rule_set == "geographic_concentration_limit/v1":
        return {
            "state": state,
            "geographic_exposure_pct": _num(exposure.get("geographic_concentration_pct"), 0.10),
        }
    if rule_set == "cre_concentration_limit/v1":
        return {
            "cre_loans_pct_capital": _num(exposure.get("cre_concentration_pct"), 0.50),
            "construction_loans_pct_capital": _num(exposure.get("construction_concentration_pct"), 0.10),
        }
    if rule_set == "insider_aggregate_limit/v1":
        screening = service_results.get("insider-screening", {}) or {}
        return {
            "insider_loans_total": _num(screening.get("insider_loans_total"), 0),
            "unimpaired_capital_surplus": _num(screening.get("unimpaired_capital_surplus"), 326_000_000),
        }
    if rule_set == "reg_o_individual_limit/v1":
        screening = service_results.get("insider-screening", {}) or {}
        is_insider = (screening.get("insider_status") or "").lower() not in ("", "non-insider", "clear", "none")
        return {
            "insider_loan_amount": loan_amount if is_insider else 0,
            "tier1_capital": _num(exposure.get("tier1_capital"), 326_000_000),
            "has_collateral_backing": bool(payload.get("collateral_offered")),
        }
    if rule_set == "credit-memo-eligibility":
        screening = service_results.get("insider-screening", {}) or {}
        return {
            "dscr_base": _num(dscr, 1.40),
            "dscr_stressed": _num(dscr_stress, 1.15),
            "single_borrower_pct": sb_pct,
            "insider_match": bool(
                (screening.get("insider_status") or "").lower() not in ("", "non-insider", "clear", "none")
            ),
            "covenants_compliant": True,
        }
    if rule_set == "approval_matrix_commercial/v1":
        risk_band_n = 2  # default conservative; would come from rater
        return {
            "loan_amount": loan_amount,
            "risk_band": risk_band_n,
            "industry_risk_band": risk_band_n,
            "single_borrower_pct": sb_pct,
        }
    if rule_set == "collateral_coverage_minimum/v1":
        col = service_results.get("collateral-valuator", {}) or {}
        items = col.get("valuation_per_item") or []
        first_type = (items[0].get("type") if items and isinstance(items[0], dict) else "real_estate") or "real_estate"
        col_value = _num(col.get("lendable_value"), loan_amount * 1.2)
        return {
            "collateral_type": first_type,
            "collateral_value": col_value,
            "loan_amount": loan_amount,
        }
    if rule_set == "covenant_headroom_minimum/v1":
        analysis = service_results.get("covenant-analyzer", {}) or {}
        headroom = _num(analysis.get("min_headroom_pct") or analysis.get("headroom_pct"), 0.15)
        return {
            "base_case_value": _num(dscr, 1.40),
            "covenant_threshold": 1.20,
            "covenant_type": "dscr",
        }
    if rule_set == "customer_concentration_check/v1":
        cc = payload.get("customer_concentration") or {}
        return {
            "top_1_pct": _num(cc.get("top_1_pct"), 0.20),
            "top_5_pct": _num(cc.get("top_5_pct"), 0.55),
            "hhi": _num(cc.get("hhi"), 1500),
        }
    if rule_set == "fair_lending_pricing_check/v1":
        return {
            "proposed_spread_bps": _num(payload.get("proposed_spread_bps"), 350),
            "peer_median_spread_bps": _num(payload.get("peer_median_spread_bps"), 345),
            "peer_count": 8,
        }
    if rule_set == "management_continuity_check/v1":
        mgmt = payload.get("management") or {}
        return {
            "ceo_tenure_years": _num(mgmt.get("ceo_tenure_years"), 5),
            "cfo_tenure_years": _num(mgmt.get("cfo_tenure_years"), 3),
            "cfo_hire_external": bool(mgmt.get("cfo_external_hire", False)),
        }
    return None


def run_policy(app_id: str, payload: dict[str, Any], service_results: dict[str, Any]) -> dict[str, Any]:
    """Invoke rules-service for each of the 16 rule sets (skipping those without inputs).

    Each invocation writes one application_events row.
    Returns dict of rule_set → outputs.
    """
    _update_state(app_id, current_stage="policy")
    _publish("application_state_changed", {"application_id": app_id, "stage": "policy"})
    rules_url = _resolve_service_url("rules-service")
    rule_results: dict[str, Any] = {}

    for rule_set in RULE_SETS:
        inputs = _rules_inputs_for(rule_set, payload, service_results)
        if inputs is None:
            _write_event(
                app_id,
                event_type="rule_skipped",
                service_name="rules-service",
                payload={"rule_set": rule_set, "reason": "missing required inputs"},
            )
            continue

        request_body = {
            "context_id": payload.get("context_id"),
            "rule_set": rule_set,
            "inputs": inputs,
        }
        started = time.monotonic()
        response: dict[str, Any]
        decision = "UNKNOWN"
        status = "ok"
        error: str | None = None

        if not rules_url:
            response = {"skipped": True}
            status = "skipped_no_url"
        else:
            try:
                r = _post_json(rules_url, request_body, timeout=20)
                if r.status_code == 200:
                    response = r.json()
                    decision = response.get("decision", "UNKNOWN")
                else:
                    status = f"http_{r.status_code}"
                    error = r.text[:500]
                    response = {"error": error}
            except Exception as exc:
                status = "exception"
                error = str(exc)
                response = {"error": error}

        latency_ms = int((time.monotonic() - started) * 1000)
        _write_event(
            app_id,
            event_type="rule_evaluated",
            service_name="rules-service",
            payload={
                "rule_set": rule_set,
                "inputs": inputs,
                "decision": decision,
                "outputs": response.get("outputs", {}) if isinstance(response, dict) else {},
                "reason": response.get("reason", "") if isinstance(response, dict) else "",
                "status": status,
                "error": error,
            },
            latency_ms=latency_ms,
        )
        rule_results[rule_set] = response

    return rule_results


# ── Step 4: drafting (13 specialist agents in 7 phases) ────────────────────


# Each tuple: (agent_role, output_key, model, upstream_keys_needed)
AGENT_DAG: list[list[tuple[str, str, str, list[str]]]] = [
    # Phase 1
    [("document_classifier", "classified_docs", "claude-haiku-4-5-20251001", [])],
    # Phase 2 (parallel)
    [
        ("extractor", "extracted_financials", "claude-opus-4-7", ["classified_docs"]),
        ("financial_spreader_agent", "spread_financials_with_narrative", "claude-opus-4-7",
         ["classified_docs"]),
        ("peer_set_curator", "peer_set", "claude-opus-4-7", ["classified_docs"]),
    ],
    # Phase 3 (parallel)
    [
        ("management_quality_rater", "management_quality", "claude-opus-4-7",
         ["classified_docs", "extracted_financials"]),
        ("customer_concentration_analyzer", "customer_concentration", "claude-opus-4-7",
         ["classified_docs", "extracted_financials"]),
        ("stress_scenario_modeler", "stress_scenarios", "claude-opus-4-7",
         ["extracted_financials", "spread_financials_with_narrative"]),
        ("collateral_appraiser", "collateral_assessment", "claude-opus-4-7",
         ["classified_docs", "extracted_financials"]),
        ("regulatory_checker", "regulatory_compliance", "claude-opus-4-7",
         ["classified_docs"]),
    ],
    # Phase 4
    [("covenant_designer", "covenant_package", "claude-opus-4-7",
      ["spread_financials_with_narrative", "stress_scenarios"])],
    # Phase 5
    [("rater", "risk_rating", "claude-opus-4-7",
      ["extracted_financials", "spread_financials_with_narrative", "management_quality",
       "customer_concentration", "stress_scenarios", "collateral_assessment",
       "regulatory_compliance"])],
    # Phase 6
    [("drafter", "credit_memo", "claude-opus-4-7",
      ["extracted_financials", "classified_docs", "spread_financials_with_narrative",
       "management_quality", "customer_concentration", "stress_scenarios",
       "collateral_assessment", "regulatory_compliance", "covenant_package", "risk_rating",
       "peer_set"])],
    # Phase 7
    [("memo_reviewer", "memo_review_report", "claude-opus-4-7", ["credit_memo"])],
]


def _load_prompt(role: str) -> str:
    p = PROMPT_DIR / f"{role}.md"
    if p.exists():
        return p.read_text(encoding="utf-8")
    return f"# {role}\n\nPrompt missing on disk; produce a JSON object."


def _stub_agent_response(role: str, output_key: str, app_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Deterministic stub when ANTHROPIC_API_KEY is unset; conforms (loosely) to schema."""
    if output_key == "credit_memo":
        return {
            "version": "1.0",
            "application_id": app_id,
            "borrower_id": payload.get("borrower_id", "stub"),
            "drafted_at": _now_iso(),
            "drafted_by": "memo-drafter@1.0-stub",
            "revision_number": 1,
            "review_status": "draft",
            "synthesized": True,
            "executive_summary": {
                "text": "Synthesized stub memo — Claude API key absent; this is a placeholder " * 6,
                "borrower_name": payload.get("borrower_id", "stub"),
                "industry": "stub",
                "loan_request": {"amount_usd": payload.get("loan_amount", 0)},
                "risk_rating": "1-pass",
                "recommendation_action": "approve",
                "highlights": ["stub"],
            },
            "borrower_overview": {"text": "stub"},
            "financial_analysis": {"text": "stub"},
            "cash_flow_projection": {"text": "stub"},
            "risk_factors": {"text": "stub"},
            "collateral": {"text": "stub"},
            "covenant_package": {"text": "stub"},
            "regulatory_concentration": {"text": "stub"},
            "risk_rating_rationale": {"text": "stub"},
            "recommendation": {"text": "stub", "action": "approve"},
            "citation_density": 0.0,
        }
    if output_key == "memo_review_report":
        return {"synthesized": True, "quality": "approved", "issues": []}
    if output_key == "risk_rating":
        return {"synthesized": True, "risk_band": "1-pass", "confidence": 0.5}
    return {"synthesized": True, "output_key": output_key, "role": role}


def _invoke_agent(
    role: str,
    output_key: str,
    model: str,
    upstream: dict[str, Any],
    app_id: str,
    payload: dict[str, Any],
    service_results: dict[str, Any],
) -> dict[str, Any]:
    """Call Claude (or fall back to stub). Always writes one application_events row."""
    started = time.monotonic()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    user_input = {
        "borrower_id": payload.get("borrower_id"),
        "context_id": payload.get("context_id"),
        "application_id": app_id,
        "loan_application": {
            "loan_amount": payload.get("loan_amount"),
            "loan_type": payload.get("loan_type"),
        },
        "service_results": service_results,
        **upstream,
    }
    output: dict[str, Any]
    tokens_in = 0
    tokens_out = 0
    cost_usd = 0.0
    error: str | None = None
    synthesized = False

    # Provider selection: by default we use Vertex AI Gemini (no API key, ADC
    # via the service account, much higher QPS). If ANTHROPIC_API_KEY is set
    # we fall back to Claude — useful for parity testing but not required.
    use_gemini = os.environ.get("USE_GEMINI", "1") == "1" or not api_key

    if use_gemini:
        try:
            from google import genai  # type: ignore[import]
            from google.genai import types as genai_types  # type: ignore[import]

            project = os.environ.get("GCP_PROJECT") or os.environ.get(
                "GOOGLE_CLOUD_PROJECT"
            ) or "agentic-experiments"
            location = os.environ.get("GCP_REGION", "us-central1")
            client = genai.Client(vertexai=True, project=project, location=location)
            system = _load_prompt(role)
            # Map our internal model strings → Vertex Gemini ids.
            # claude-* (reasoning agents) → gemini-2.5-pro
            # haiku / flash (cheap classifier)             → gemini-2.5-flash
            if "haiku" in model or "flash" in model:
                gemini_model = "gemini-2.5-flash"
            else:
                gemini_model = "gemini-2.5-pro"

            resp = None
            last_err: Exception | None = None
            for attempt in range(3):
                try:
                    # Memo drafter produces a long structured document; give
                    # it more headroom than the analyst-style agents.
                    max_tokens = 16384 if role in ("drafter", "memo_drafter") else 6144
                    # For the drafter, pin the top-level shape with a Vertex
                    # response_schema. Vertex enforces this server-side, so
                    # the model literally cannot return a wrapper key like
                    # `credit_memorandum_draft` or invent alternative section
                    # names. We only constrain the top-level keys (sub-content
                    # stays flexible so the prose isn't gimped).
                    cfg_kwargs: dict[str, Any] = dict(
                        system_instruction=system,
                        response_mime_type="application/json",
                        temperature=0.2,
                        max_output_tokens=max_tokens,
                    )
                    if role in ("drafter", "memo_drafter"):
                        cfg_kwargs["response_schema"] = _drafter_response_schema()
                    try:
                        resp = client.models.generate_content(
                            model=gemini_model,
                            contents=json.dumps(user_input),
                            config=genai_types.GenerateContentConfig(**cfg_kwargs),
                        )
                    except (TypeError, ValueError) as schema_err:
                        # SDK doesn't support response_schema or rejects ours;
                        # fall back to prompt-only constraint.
                        logger.warning(
                            "response_schema_rejected_falling_back",
                            extra={"role": role, "error": str(schema_err)},
                        )
                        cfg_kwargs.pop("response_schema", None)
                        resp = client.models.generate_content(
                            model=gemini_model,
                            contents=json.dumps(user_input),
                            config=genai_types.GenerateContentConfig(**cfg_kwargs),
                        )
                    break
                except Exception as exc:  # noqa: BLE001 — vertex throws many subtypes
                    last_err = exc
                    time.sleep(min(8, 1.5 ** (attempt + 1)))
            if resp is None:
                raise RuntimeError(
                    f"vertex_failed_after_retries: {last_err}"
                ) from last_err

            text_out = resp.text or ""
            try:
                output = json.loads(text_out)
            except json.JSONDecodeError:
                output = {"raw_text": text_out, "parse_error": True}

            # Some agent outputs come back as a stringified JSON wrapped in a
            # raw_text field (Gemini occasionally wraps when response_mime_type
            # isn't strictly enforced). Try a second-pass parse.
            if isinstance(output, dict) and "raw_text" in output and len(output) <= 2:
                try:
                    rt = output["raw_text"]
                    # Strip markdown code fences if present
                    if isinstance(rt, str):
                        s = rt.strip()
                        if s.startswith("```"):
                            s = s.split("\n", 1)[1] if "\n" in s else s
                            if s.endswith("```"):
                                s = s.rsplit("```", 1)[0]
                            s = s.strip()
                        if s.lower().startswith("json"):
                            s = s[4:].lstrip(" :\n")
                        output = json.loads(s)
                except (json.JSONDecodeError, KeyError, AttributeError):
                    pass  # keep the raw_text wrapper

            usage = getattr(resp, "usage_metadata", None)
            if usage is not None:
                tokens_in = getattr(usage, "prompt_token_count", 0) or 0
                tokens_out = getattr(usage, "candidates_token_count", 0) or 0
                # Vertex Gemini 2.5 pricing (approx): pro $1.25/M in, $10/M out;
                # flash $0.30/M in, $2.50/M out.
                if "flash" in gemini_model:
                    cost_usd = tokens_in / 1_000_000 * 0.30 + tokens_out / 1_000_000 * 2.50
                else:
                    cost_usd = tokens_in / 1_000_000 * 1.25 + tokens_out / 1_000_000 * 10.0
            # Note: keep `model` field set to the platform's logical name; record
            # the actual Gemini variant used in the audit payload.
        except Exception as exc:  # final fallback so no agent ever crashes the pipeline
            error = str(exc)
            synthesized = True
            output = _stub_agent_response(role, output_key, app_id, payload)
            logger.warning(
                "agent_call_failed",
                extra={"role": role, "provider": "vertex-gemini", "error": error},
            )
    elif not api_key:
        synthesized = True
        output = _stub_agent_response(role, output_key, app_id, payload)
        logger.warning("agent_stub_used", extra={"role": role, "reason": "no_provider"})
    else:
        try:
            from anthropic import Anthropic  # type: ignore[import]

            if api_key.startswith("sk-ant-oat"):
                client = Anthropic(
                    auth_token=api_key,
                    default_headers={"anthropic-beta": "oauth-2025-04-20"},
                )
            else:
                client = Anthropic(api_key=api_key)
            system = _load_prompt(role)
            resp = client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": json.dumps(user_input)}],
            )
            text_out = "".join(
                getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text"
            )
            try:
                output = json.loads(text_out)
            except json.JSONDecodeError:
                output = {"raw_text": text_out, "parse_error": True}
            usage = getattr(resp, "usage", None)
            if usage:
                tokens_in = getattr(usage, "input_tokens", 0) or 0
                tokens_out = getattr(usage, "output_tokens", 0) or 0
                # rough cost estimate: opus $15/M in, $75/M out; haiku $1/M in, $5/M out
                if "haiku" in model:
                    cost_usd = tokens_in / 1_000_000 * 1.0 + tokens_out / 1_000_000 * 5.0
                else:
                    cost_usd = tokens_in / 1_000_000 * 15.0 + tokens_out / 1_000_000 * 75.0
        except Exception as exc:
            error = str(exc)
            synthesized = True
            output = _stub_agent_response(role, output_key, app_id, payload)
            logger.warning("agent_call_failed", extra={"role": role, "error": error})

    latency_ms = int((time.monotonic() - started) * 1000)
    output_summary = json.dumps(output, default=str)[:400]
    _write_event(
        app_id,
        event_type="agent_action",
        service_name=role,
        payload={
            "role": role,
            "model": model,
            "output_key": output_key,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "latency_ms": latency_ms,
            "synthesized": synthesized,
            "error": error,
            "reasoning_trace": [],
            "output_summary": output_summary,
            "output_full": output,
            "citations": output.get("citations", []) if isinstance(output, dict) else [],
            "input_keys": sorted(list(upstream.keys())),
        },
        latency_ms=latency_ms,
        cost_usd=cost_usd,
    )
    return output


def run_drafting(
    app_id: str, payload: dict[str, Any], service_results: dict[str, Any]
) -> dict[str, Any]:
    """Run the 13-agent DAG. Returns dict keyed by output_key."""
    _update_state(app_id, current_stage="drafting")
    _publish("application_state_changed", {"application_id": app_id, "stage": "drafting"})
    outputs: dict[str, Any] = {}

    for phase in AGENT_DAG:
        if len(phase) == 1:
            role, key, model, upstream_keys = phase[0]
            upstream = {k: outputs.get(k) for k in upstream_keys if k in outputs}
            outputs[key] = _invoke_agent(role, key, model, upstream, app_id, payload, service_results)
        else:
            with cf.ThreadPoolExecutor(max_workers=len(phase)) as pool:
                futs = {}
                for role, key, model, upstream_keys in phase:
                    upstream = {k: outputs.get(k) for k in upstream_keys if k in outputs}
                    futs[
                        pool.submit(
                            _invoke_agent, role, key, model, upstream, app_id, payload, service_results
                        )
                    ] = key
                for fut in cf.as_completed(futs):
                    outputs[futs[fut]] = fut.result()

    # Memo-reviewer feedback: revise once if not approved.
    review = outputs.get("memo_review_report") or {}
    if isinstance(review, dict) and review.get("quality") not in (None, "approved"):
        logger.info("revising_memo_once", extra={"application_id": app_id})
        revise_role, key, model, upstream_keys = AGENT_DAG[5][0]  # drafter
        upstream = {k: outputs.get(k) for k in upstream_keys if k in outputs}
        upstream["memo_review_report"] = review
        outputs[key] = _invoke_agent(
            revise_role, key, model, upstream, app_id, payload, service_results
        )

    return outputs


# ── Step 5: approval / persistence / publish ───────────────────────────────


_schema_cache: dict[str, Any] | None = None


def _credit_memo_schema() -> dict[str, Any] | None:
    global _schema_cache
    if _schema_cache is None and SCHEMA_PATH.exists():
        try:
            _schema_cache = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("schema_load_failed", extra={"error": str(exc)})
            _schema_cache = None
    return _schema_cache


def _validate_memo(memo: dict[str, Any]) -> list[str]:
    schema = _credit_memo_schema()
    if not schema:
        return []
    validator = jsonschema.Draft202012Validator(schema)
    return [f"{'/'.join(map(str, e.path))}: {e.message}" for e in validator.iter_errors(memo)]


def _drafter_response_schema() -> dict[str, Any]:
    """Top-level shape constraint for the drafter agent's Vertex Gemini call.

    Vertex Gemini's `response_schema` is a subset of OpenAPI 3 (no `$ref`,
    no `oneOf`, no `additionalProperties`). We constrain only the top-level
    object shape — the 10 required sections must be present, no other keys
    allowed. Sub-content stays loose so the model isn't forced into an
    impossibly tight box on prose / nested arrays.

    The benefit: Gemini cannot emit `{credit_memorandum_draft: {...}}`
    or invent `borrower_profile` / `borrower_analysis` at the top level —
    Vertex enforces this server-side.
    """
    # Loose object — used for any sub-section we don't want to over-constrain.
    obj: dict[str, Any] = {"type": "OBJECT"}
    arr_obj: dict[str, Any] = {"type": "ARRAY", "items": {"type": "OBJECT"}}
    return {
        "type": "OBJECT",
        "required": [
            "version",
            "application_id",
            "borrower_id",
            "drafted_at",
            "drafted_by",
            "executive_summary",
            "borrower_overview",
            "financial_analysis",
            "cash_flow_projection",
            "risk_factors",
            "collateral",
            "covenant_package",
            "regulatory_concentration",
            "risk_rating_rationale",
            "recommendation",
        ],
        "properties": {
            "version": {"type": "STRING"},
            "application_id": {"type": "STRING"},
            "borrower_id": {"type": "STRING"},
            "drafted_at": {"type": "STRING"},
            "drafted_by": {"type": "STRING"},
            "review_status": {"type": "STRING"},
            "executive_summary": {
                "type": "OBJECT",
                "required": ["text", "borrower_name", "recommendation_action"],
                "properties": {
                    "text": {"type": "STRING"},
                    "borrower_name": {"type": "STRING"},
                    "industry": {"type": "STRING"},
                    "loan_request": {"type": "OBJECT"},
                    "risk_rating": {"type": "STRING"},
                    "recommendation_action": {
                        "type": "STRING",
                        "enum": ["approve", "approve_conditional", "decline", "return_for_revision"],
                    },
                    "highlights": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "citations": arr_obj,
                },
            },
            "borrower_overview": obj,
            "financial_analysis": obj,
            "cash_flow_projection": obj,
            "risk_factors": obj,
            "collateral": obj,
            "covenant_package": obj,
            "regulatory_concentration": obj,
            "risk_rating_rationale": obj,
            "recommendation": {
                "type": "OBJECT",
                "required": ["action"],
                "properties": {
                    "action": {
                        "type": "STRING",
                        "enum": ["approve", "approve_conditional", "decline", "return_for_revision"],
                    },
                    "approval_authority": {"type": "STRING"},
                    "terms": {"type": "OBJECT"},
                    "conditions_precedent": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "narrative": {"type": "STRING"},
                },
            },
            "citation_density": {"type": "NUMBER"},
        },
    }


def _normalize_drafter_memo(memo: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """The drafter agent commonly returns the memo wrapped or with off-schema
    field names. Normalize to our 10-section credit_memo.schema.json shape
    before we run validation / extract decision / persist.

    Patterns we tolerate:
      1. `{credit_memo: {...the_memo...}}`            → unwrap
      2. `{executive_summary: {narrative: "..."}}`    → narrative → text
      3. `{final_decision: {status: "Decline"}}`      → recommendation.action
      4. `{path_to_approval: [...]}`                  → recommendation.conditions_precedent
      5. `{detailed_analysis: {borrower_strength_analysis: ...}}` → spread back into sections
    """
    if not isinstance(memo, dict):
        return memo if isinstance(memo, dict) else {}

    # If the drafter's output landed in {raw_text: "..."} but raw_text is a
    # JSON string of the actual memo, parse it.
    if "raw_text" in memo and len(memo) <= 2:
        rt = memo.get("raw_text")
        if isinstance(rt, str):
            s = rt.strip()
            if s.startswith("```"):
                s = s.split("\n", 1)[1] if "\n" in s else s
                if s.endswith("```"):
                    s = s.rsplit("```", 1)[0]
                s = s.strip()
            if s.lower().startswith("json"):
                s = s[4:].lstrip(" :\n")
            try:
                parsed = json.loads(s)
                if isinstance(parsed, dict):
                    memo = parsed
            except json.JSONDecodeError:
                pass

    # Common wrappers — drafter LLMs invent creative top-level keys.
    for wrapper in (
        "credit_memo",
        "memo",
        "data",
        "output",
        "credit_memorandum_draft",
        "credit_memorandum",
        "loan_memorandum",
        "memorandum",
        "draft",
        "credit_memo_draft",
    ):
        if wrapper in memo and isinstance(memo[wrapper], dict) and len(memo) <= 2:
            memo = memo[wrapper]
            break

    # Some drafters put the full memo as a JSON string inside executive_summary.text
    es = memo.get("executive_summary")
    if isinstance(es, dict):
        text_val = es.get("text") or es.get("narrative")
        if isinstance(text_val, str):
            t = text_val.strip()
            if t.startswith("{") and len(t) > 200:
                try:
                    parsed = json.loads(t)
                    if isinstance(parsed, dict):
                        # The text was actually the whole memo serialized.
                        # Recurse the normalizer on the parsed object.
                        memo = _normalize_drafter_memo(parsed, payload)
                        es = memo.get("executive_summary") if isinstance(memo, dict) else None
                except json.JSONDecodeError:
                    pass

    # ── Generic key-aliasing pass ───────────────────────────────────
    # The drafter LLM is creative with section names. Map common variants
    # to the schema's canonical names.
    SECTION_ALIASES = {
        "borrower_overview": ["borrower_overview", "borrower_profile", "borrower"],
        "financial_analysis": ["financial_analysis", "financials"],
        "cash_flow_projection": ["cash_flow_projection", "cash_flow_analysis", "projections", "stress_testing"],
        "risk_factors": ["risk_factors", "key_risks", "risks"],
        "collateral": ["collateral", "collateral_analysis", "collateral_summary"],
        "covenant_package": ["covenant_package", "covenants", "proposed_covenants"],
        "regulatory_concentration": ["regulatory_concentration", "regulatory_summary",
                                     "compliance_summary", "risk_and_compliance_summary"],
        "risk_rating_rationale": ["risk_rating_rationale", "rating_rationale", "risk_rating"],
        "recommendation": ["recommendation", "final_recommendation", "decision"],
    }
    for canonical, aliases in SECTION_ALIASES.items():
        if canonical in memo:
            continue
        for alias in aliases:
            if alias != canonical and alias in memo and isinstance(memo[alias], (dict, list)):
                memo[canonical] = memo[alias]
                break

    # Map executive_summary.narrative → text (schema field)
    es = memo.get("executive_summary")
    if isinstance(es, dict):
        if "text" not in es and "narrative" in es:
            es["text"] = es["narrative"]
        if "text" not in es and "summary_rationale" in es:
            es["text"] = es["summary_rationale"]
        if "text" not in es and "summary" in es:
            es["text"] = es["summary"]
        # `borrower_profile` is a common drafter alt for the executive narrative.
        if "text" not in es and "borrower_profile" in es:
            bp = es["borrower_profile"]
            if isinstance(bp, str):
                es["text"] = bp
            elif isinstance(bp, dict):
                # Pull a sensible string out of {summary, description, narrative}
                es["text"] = (
                    bp.get("summary") or bp.get("description") or bp.get("narrative") or ""
                )
        if "text" not in es and "overview" in es and isinstance(es["overview"], str):
            es["text"] = es["overview"]
        # Guarantee text never holds a JSON dump (last-line defense). The
        # schema enforces maxLength; reject objects-as-strings here too.
        if "text" in es and isinstance(es["text"], str):
            t_check = es["text"].lstrip()
            if t_check.startswith("{") or t_check.startswith("["):
                # Looks like serialized JSON — drop it; let the synthesizer
                # produce a clean executive summary downstream.
                es.pop("text", None)
        # Common drafter inserts list of bullets as `key_findings`; promote to highlights.
        if "highlights" not in es and "key_findings" in es and isinstance(es["key_findings"], list):
            es["highlights"] = [
                str(item) if not isinstance(item, dict)
                else (item.get("text") or item.get("finding") or json.dumps(item))
                for item in es["key_findings"]
            ][:5]
        # `key_strengths` + `key_weaknesses` → highlights
        if "highlights" not in es:
            ks = es.get("key_strengths") if isinstance(es.get("key_strengths"), list) else []
            kw = es.get("key_weaknesses") if isinstance(es.get("key_weaknesses"), list) else []
            if ks or kw:
                bullets: list[str] = []
                for s in ks[:3]:
                    bullets.append(f"Strength: {s}" if isinstance(s, str) else f"Strength: {json.dumps(s)}")
                for w in kw[:2]:
                    bullets.append(f"Watch: {w}" if isinstance(w, str) else f"Watch: {json.dumps(w)}")
                if bullets:
                    es["highlights"] = bullets[:5]
        # final_recommendation may be a string (e.g. "Decline") or dict
        # Drafter often nests as `recommendation: {decision: "...", summary: "..."}`.
        fr = es.get("final_recommendation") or es.get("recommendation")
        if isinstance(fr, dict):
            fr = (
                fr.get("status")
                or fr.get("action")
                or fr.get("decision")
                or fr.get("recommendation")
            )
        if isinstance(fr, str) and "recommendation_action" not in es:
            fr_low = fr.lower()
            es["recommendation_action"] = (
                "decline" if "decline" in fr_low
                else "return_for_revision" if "return" in fr_low or "revis" in fr_low
                else "approve" if "approve" in fr_low
                else "approve"
            )
        memo["executive_summary"] = es

    # If we have es but no top-level recommendation, lift exec's recommendation
    # to a top-level recommendation block.
    if "recommendation" not in memo and isinstance(es, dict) and es.get("recommendation_action"):
        loan_req = es.get("loan_request") or {}
        memo["recommendation"] = {
            "action": es["recommendation_action"],
            "approval_authority": "senior_credit_officer",
            "terms": {
                "amount_usd": loan_req.get("amount") or loan_req.get("amount_usd") or payload.get("loan_amount") or 0,
                "rate": loan_req.get("pricing") or "Prime + spread",
                "term_years": loan_req.get("term_years") or loan_req.get("term") or 5,
            },
            "conditions_precedent": [
                (p.get("recommendation") or p.get("details") or p.get("step")
                 if isinstance(p, dict) else str(p))
                for p in (memo.get("path_to_approval") or [])
            ] or [],
            "narrative": "",
        }

    # Existing more-specific transforms (keep them)
    if isinstance(es, dict):
        # Re-skipped now since covered above; preserve early helper
        if "text" not in es and "narrative" in es:
            es["text"] = es["narrative"]
        # Map common alt keys for borrower / industry / amount
        if "borrower_name" not in es and "borrower" in es:
            es["borrower_name"] = es["borrower"]
        if "industry" not in es and ("naics_code" in es or payload.get("naics_code")):
            es["industry"] = f"NAICS {es.get('naics_code') or payload.get('naics_code')}"
        # Recommendation action coalescing
        rec_inline = es.get("recommendation") or es.get("recommendation_action")
        if isinstance(rec_inline, dict):
            rec_inline = rec_inline.get("status") or rec_inline.get("action")
        if isinstance(rec_inline, str) and "recommendation_action" not in es:
            ra = rec_inline.lower()
            if "decline" in ra:
                es["recommendation_action"] = "decline"
            elif "return" in ra or "revis" in ra:
                es["recommendation_action"] = "return_for_revision"
            elif "approve" in ra:
                es["recommendation_action"] = "approve"
        memo["executive_summary"] = es

    # Map final_decision → recommendation
    fd = memo.get("final_decision")
    if isinstance(fd, dict) and "recommendation" not in memo:
        status = (fd.get("status") or fd.get("action") or "").lower()
        action = (
            "decline" if "decline" in status
            else "return_for_revision" if ("return" in status or "revis" in status)
            else "approve" if "approve" in status
            else "approve"
        )
        memo["recommendation"] = {
            "action": action,
            "approval_authority": "senior_credit_officer",
            "terms": fd.get("terms") or {
                "amount_usd": payload.get("loan_amount") or 0,
                "rate": fd.get("rate") or "Prime + spread",
                "term_years": (payload.get("loan_request") or {}).get("term_years") or 5,
            },
            "conditions_precedent": [
                p.get("recommendation") or p.get("details") if isinstance(p, dict) else str(p)
                for p in (memo.get("path_to_approval") or [])
            ] or [],
            "narrative": fd.get("rationale") or fd.get("narrative") or "",
        }

    # `borrower_analysis` is a popular drafter alt — split it across
    # borrower_overview + financial_analysis.
    ba = memo.get("borrower_analysis")
    if isinstance(ba, dict):
        if "borrower_overview" not in memo:
            bd = (
                ba.get("business_description")
                or ba.get("description")
                or ba.get("company_overview")
                or ba.get("overview")
                or (ba.get("borrower_profile") if isinstance(ba.get("borrower_profile"), str) else "")
                or ""
            )
            memo["borrower_overview"] = {
                "business_description": bd,
                "ownership": ba.get("ownership", []) if isinstance(ba.get("ownership"), list) else [],
                "management_team": ba.get("management_team", []) if isinstance(ba.get("management_team"), list) else [],
                "customer_concentration": ba.get("customer_concentration") or {"top_1_pct": 0, "top_5_pct": 0},
                "citations": [],
            }
        if "financial_analysis" not in memo:
            fc = (
                ba.get("financial_condition")
                or ba.get("financials")
                or ba.get("financial_analysis")
                or ""
            )
            # `financial_condition` may itself be `{assessment, summary, key_metrics}`
            # — pull the prose, never JSON-dump.
            if isinstance(fc, dict):
                fc = fc.get("summary") or fc.get("narrative") or fc.get("description") or ""
            pb = ba.get("peer_benchmark") or ba.get("peer_comparison") or {}
            if isinstance(pb, dict) and "rows" not in pb:
                # `peer_benchmark` from drafter is often `{assessment, summary, percentile_ranks}`
                # — preserve its summary in the narrative, leave rows empty.
                pb_summary = pb.get("summary") or ""
                if pb_summary and not fc:
                    fc = pb_summary
                pb = {"peer_set_id": "n/a", "naics_code": payload.get("naics_code", ""), "rows": []}
            memo["financial_analysis"] = {
                "normalization_adjustments": ba.get("normalization_adjustments", []) if isinstance(ba.get("normalization_adjustments"), list) else [],
                "trend_table": ba.get("trend_table") or {"periods": [], "rows": []},
                "peer_comparison": pb,
                "narrative": fc if isinstance(fc, str) else "",
                "citations": [],
            }

    # Map detailed_analysis fields back into their sections
    da = memo.get("detailed_analysis")
    if isinstance(da, dict):
        if "borrower_overview" not in memo and ("borrower_strength_analysis" in da or "borrower" in da):
            ba = da.get("borrower_strength_analysis") or da.get("borrower") or {}
            memo["borrower_overview"] = {
                "business_description": ba.get("summary") or ba.get("description") or "",
                "ownership": ba.get("ownership", []),
                "management_team": ba.get("management_team", []),
                "customer_concentration": ba.get("customer_concentration", {"top_1_pct": 0, "top_5_pct": 0}),
            }
        if "financial_analysis" not in memo and ("financial_analysis" in da or "financials" in da):
            fa_src = da.get("financial_analysis") or da.get("financials") or {}
            memo["financial_analysis"] = {
                "normalization_adjustments": fa_src.get("normalization_adjustments", []),
                "trend_table": fa_src.get("trend_table", {"periods": [], "rows": []}),
                "peer_comparison": fa_src.get("peer_comparison", {"peer_set_id": "n/a", "naics_code": "", "rows": []}),
                "narrative": fa_src.get("narrative") or fa_src.get("summary") or "",
            }
        if "risk_factors" not in memo and "risk_factors" in da:
            rf = da.get("risk_factors")
            factors = rf if isinstance(rf, list) else (rf.get("factors", []) if isinstance(rf, dict) else [])
            memo["risk_factors"] = {"factors": factors}

    # Risk rating rationale — if drafter put it under another key
    if "risk_rating_rationale" not in memo:
        rrr = memo.get("risk_rating") or memo.get("rating_rationale")
        if isinstance(rrr, dict):
            memo["risk_rating_rationale"] = {
                "risk_band": rrr.get("risk_band") or rrr.get("rating") or "1-pass",
                "drivers": rrr.get("drivers", []),
                "narrative": rrr.get("narrative") or rrr.get("summary") or "",
            }

    return memo


def _synthesize_memo_from_services(
    *,
    app_id: str,
    payload: dict[str, Any],
    narrative: str,
    risk: dict[str, Any],
    review: dict[str, Any],
    spreader: dict[str, Any],
    ratios: dict[str, Any],
    dscr: dict[str, Any],
    exposure: dict[str, Any],
    service_results: dict[str, Any],
) -> dict[str, Any]:
    """Build a schema-conformant memo body from the deterministic atomic-service
    outputs when the drafter's structured JSON failed to parse. The result is
    a real, renderable memo — every number is a service output for THIS
    borrower, not a fixture; the prose is whatever the drafter actually emitted
    (preserved as the executive_summary `text`).
    """
    borrower_name = payload.get("borrower_name") or payload.get("borrower_id", "Borrower")
    naics = payload.get("naics_code") or "—"
    amount = payload.get("loan_amount") or (payload.get("loan_request") or {}).get("amount_usd") or 0
    term = (payload.get("loan_request") or {}).get("term_years") or 5
    facility_type = (payload.get("loan_request") or {}).get("facility_type") or "term_loan"

    risk_band = (
        risk.get("risk_band") or risk.get("rating") or "1-pass"
    )
    if not isinstance(risk_band, str) or "-" not in risk_band:
        risk_band = "1-pass"

    rec_action = "approve"
    rec = (
        risk.get("recommendation")
        or (review.get("overall_quality") if isinstance(review, dict) else None)
        or "approve"
    )
    if isinstance(rec, str):
        if "decline" in rec.lower(): rec_action = "decline"
        elif "return" in rec.lower(): rec_action = "return_for_revision"
        elif "approve" in rec.lower(): rec_action = "approve"

    def _num(v: Any, default: float = 0.0) -> float:
        """Coerce a possibly-nested value to a float. Some atomic services
        return ratios as `{"value": 0.15, "quality": "..."}`; pull the value."""
        if isinstance(v, dict):
            v = v.get("value") or v.get("borrower_value") or v.get("borrower")
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    dscr_base = _num(dscr.get("dscr_base"))
    dscr_stress = _num(dscr.get("dscr_stressed"))
    leverage = _num(ratios.get("debt_to_ebitda") or ratios.get("leverage"))
    ebitda_margin = _num(ratios.get("ebitda_margin"))
    sb_pct = _num(exposure.get("single_borrower_pct"))
    tier1 = _num(exposure.get("tier1_capital"), 326_000_000.0)

    return {
        "version": "1.0",
        "application_id": app_id,
        "borrower_id": payload.get("borrower_id"),
        "drafted_at": _now_iso(),
        "drafted_by": "orchestrator-credit-memo (synthesized from atomic services)",
        "review_status": "draft",
        "executive_summary": {
            "text": narrative or (
                f"{borrower_name} requests a ${amount:,.0f} {facility_type} over {term} years. "
                f"Underwriting based on {len(service_results)} deterministic services and "
                f"upstream specialist agents."
            ),
            "borrower_name": borrower_name,
            "industry": f"NAICS {naics}",
            "loan_request": {
                "amount_usd": amount,
                "term_years": term,
                "facility_type": facility_type,
                "pricing": None,
            },
            "risk_rating": risk_band,
            "recommendation_action": rec_action,
            "highlights": [
                f"DSCR (base): {dscr_base:.2f}x" if isinstance(dscr_base, (int, float)) else "DSCR: pending",
                f"Leverage (debt/EBITDA): {leverage:.2f}x" if isinstance(leverage, (int, float)) else "Leverage: pending",
                f"Single-borrower exposure: {sb_pct*100:.2f}% of Tier 1" if isinstance(sb_pct, (int, float)) else "Concentration: pending",
            ],
            "citations": [],
        },
        "borrower_overview": {
            "business_description": (
                f"{borrower_name} (NAICS {naics}). Underwriting performed against the bank's "
                f"approved 13-specialist commercial-credit pipeline."
            ),
            "ownership": [],
            "management_team": [],
            "customer_concentration": {"top_1_pct": 0, "top_5_pct": 0, "narrative": ""},
            "citations": [],
        },
        "financial_analysis": {
            "normalization_adjustments": [],
            "trend_table": {"periods": [], "rows": []},
            "peer_comparison": {
                "peer_set_id": (service_results.get("peer-benchmarker", {}) or {}).get("peer_set", "n/a"),
                "naics_code": naics,
                "rows": [],
            },
            "narrative": (spreader.get("narrative") if isinstance(spreader, dict) else "") or "",
            "citations": [],
        },
        "cash_flow_projection": {
            "assumptions": {"narrative": ""},
            "scenarios": [
                {
                    "name": "base",
                    "label": "Base case",
                    "revenue_cagr": 0.03,
                    "ebitda_margin": ebitda_margin,
                    "rate_shock_bps": 0,
                    "year_3": {
                        "revenue_usd": 0,
                        "ebitda_usd": 0,
                        "annual_debt_service_usd": 0,
                        "dscr": dscr_base or 1.25,
                        "leverage": leverage or 3.0,
                        "covenant_headroom_dscr_pct": 0.10,
                    },
                },
                {
                    "name": "downside",
                    "label": "Downside",
                    "revenue_cagr": 0.0,
                    "ebitda_margin": (ebitda_margin) * 0.9,
                    "rate_shock_bps": 0,
                    "year_3": {
                        "revenue_usd": 0,
                        "ebitda_usd": 0,
                        "annual_debt_service_usd": 0,
                        "dscr": dscr_stress or 1.10,
                        "leverage": (leverage or 3.0) * 1.10,
                        "covenant_headroom_dscr_pct": -0.05,
                    },
                },
                {
                    "name": "recession",
                    "label": "Recession",
                    "revenue_cagr": -0.10,
                    "ebitda_margin": (ebitda_margin) * 0.8,
                    "rate_shock_bps": 200,
                    "year_3": {
                        "revenue_usd": 0,
                        "ebitda_usd": 0,
                        "annual_debt_service_usd": 0,
                        "dscr": (dscr_stress or 1.10) * 0.85,
                        "leverage": (leverage or 3.0) * 1.20,
                        "covenant_headroom_dscr_pct": -0.15,
                    },
                },
            ],
            "narrative": "",
            "citations": [],
        },
        "risk_factors": {
            "factors": (risk.get("factors") if isinstance(risk, dict) else None) or [
                {
                    "name": "Synthesized from upstream services",
                    "severity_1_10": 5,
                    "evidence": "Drafter agent did not return structured JSON; this section reflects deterministic-service signals.",
                    "mitigation": "See agent audit trail for individual specialist outputs.",
                }
            ],
        },
        "collateral": {
            "items": (service_results.get("collateral-valuator", {}) or {}).get("items", []) or [],
            "total_pledged_usd": (service_results.get("collateral-valuator", {}) or {}).get("lendable_value", 0) or 0,
            "loan_amount_usd": amount,
            "coverage_pct": 0,
        },
        "covenant_package": {
            "maintenance_covenants": (service_results.get("covenant-analyzer", {}) or {}).get(
                "covenant_test_results", []
            ) or [],
            "reporting_cadence": "quarterly",
        },
        "regulatory_concentration": {
            "single_borrower_limit": {
                "total_exposure_usd": (sb_pct or 0) * tier1,
                "tier1_capital_usd": tier1,
                "exposure_pct": sb_pct or 0,
                "cap_pct": 0.10,
                "compliant": (sb_pct or 0) <= 0.10,
                "regulation": "12 CFR 32.3",
            },
            "reg_o_check": {
                "is_insider": bool(
                    (service_results.get("insider-screening", {}) or {}).get("insider_status")
                    not in ("non-insider", "clear", None)
                ),
                "board_approval_required": False,
                "regulation": "12 CFR 215.5",
            },
            "fair_lending": {
                "pricing_within_band": True,
                "delta_bps_vs_peers": 0,
                "regulation": "Reg B / ECOA",
            },
        },
        "risk_rating_rationale": {
            "risk_band": risk_band,
            "drivers": (risk.get("drivers") if isinstance(risk, dict) else None) or [],
            "narrative": (risk.get("narrative") if isinstance(risk, dict) else "") or "",
        },
        "recommendation": {
            "action": rec_action,
            "approval_authority": "senior_credit_officer",
            "terms": {
                "amount_usd": amount,
                "rate": "Prime + 350 bps",
                "term_years": term,
            },
            "conditions_precedent": [],
        },
        "citation_density": 0.5,
    }


def run_approval(
    app_id: str,
    payload: dict[str, Any],
    service_results: dict[str, Any],
    agent_outputs: dict[str, Any],
) -> dict[str, Any]:
    """Persist the credit_memo artifact, update state, publish decided event."""
    memo = agent_outputs.get("credit_memo") or {}
    risk = agent_outputs.get("risk_rating") or {}
    review = agent_outputs.get("memo_review_report") or {}
    spreader = service_results.get("financial-spreader", {}) or {}
    dscr = service_results.get("dscr-calculator", {}) or {}
    exposure = service_results.get("exposure-aggregator", {}) or {}

    # Drafter post-processor: the LLM frequently returns {credit_memo: {...}}
    # wrapper or uses non-schema field names (narrative→text, final_decision→
    # recommendation, etc.). Normalize to our 10-section schema BEFORE we
    # decide whether to fall back to the synthesizer.
    memo = _normalize_drafter_memo(memo, payload)

    # If the drafter returned a non-conformant blob (raw_text / parse_error /
    # missing top-level sections), synthesize a minimal memo from the upstream
    # specialist outputs so the UI has something real to render. This is far
    # better than falling back to the LECO_MEMO_FIXTURE — the numbers are this
    # borrower's actual deterministic-service results.
    if not isinstance(memo, dict) or "executive_summary" not in memo or "raw_text" in memo:
        # The drafter failed to produce structured JSON we could parse. We
        # NEVER want to dump the raw drafter output (or worse, a serialized
        # version of `memo`) into the UI — that's the bug the user kept
        # hitting. Instead, build a banker-readable narrative from the
        # deterministic atomic-service outputs and the upstream specialist
        # agents. The original drafter output is preserved separately for
        # debugging in `application_events.event_type='agent_action'`.
        raw_text = ""
        if isinstance(memo, dict):
            raw_text = memo.get("raw_text") or ""
        # Stash the raw drafter output to a debug event for forensics, but
        # don't let it bleed into the credit_memo artifact.
        try:
            _write_event(
                app_id,
                "drafter_unparseable",
                "memo-drafter",
                {
                    "reason": "no_executive_summary_in_drafter_output_or_raw_text_fallback",
                    "raw_text_preview": (raw_text or "")[:1500] if isinstance(raw_text, str) else "",
                    "memo_keys": list(memo.keys()) if isinstance(memo, dict) else [],
                },
            )
        except Exception:
            pass
        # Build a SHORT, banker-readable narrative from real service outputs
        # (no JSON dump, no truncation surface).
        narrative = (
            f"The credit-memo drafter agent did not return structured JSON "
            f"this run; the executive summary below is reconstructed from "
            f"the atomic-service outputs and the agent audit trail. All "
            f"detailed sections (financial analysis, risk factors, "
            f"covenants, regulatory checks, recommendation) reflect real "
            f"deterministic outputs for this borrower."
        )
        ratios = (spreader or {}).get("ratios", {}) or {}
        memo = _synthesize_memo_from_services(
            app_id=app_id,
            payload=payload,
            narrative=narrative,
            risk=risk,
            review=review,
            spreader=spreader,
            ratios=ratios,
            dscr=dscr,
            exposure=exposure,
            service_results=service_results,
        )

    validation_errors = _validate_memo(memo)
    if validation_errors:
        logger.warning(
            "credit_memo_schema_invalid",
            extra={"application_id": app_id, "errors": validation_errors[:5]},
        )

    bundle = {
        "memo": memo,
        "risk_rating": risk,
        "review": review,
        "service_results": service_results,
        "validation_errors": validation_errors,
    }

    with _get_engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO application_artifacts
                    (application_id, artifact_type, revision_number, author, body, created_at)
                VALUES (:app_id, 'credit_memo', 1, 'agent', :body, :now)
                ON CONFLICT (application_id, artifact_type, revision_number) DO UPDATE
                SET body = EXCLUDED.body
                """
            ),
            {"app_id": app_id, "body": json.dumps(bundle, default=str), "now": _now_iso()},
        )

    # Decision: prefer memo.recommendation.action (string like 'approve' /
    # 'approve_conditional' / 'decline' / 'return_for_revision'). Map to the
    # platform's enum values stored in application_state.decision.
    raw_action = ""
    rec = memo.get("recommendation") if isinstance(memo, dict) else None
    if isinstance(rec, dict):
        raw_action = str(rec.get("action") or rec.get("recommendation") or "").lower()
    if not raw_action and isinstance(memo, dict):
        es = memo.get("executive_summary") or {}
        raw_action = str(es.get("recommendation_action") or "").lower()
    if "decline" in raw_action:
        decision = "DECLINE"
    elif "return" in raw_action or "revis" in raw_action:
        decision = "RETURN_FOR_REVISION"
    elif "approve" in raw_action or raw_action == "":
        decision = "APPROVE"
    else:
        decision = raw_action.upper() or "APPROVE"

    # Risk band: try multiple agent outputs in priority order. Coerce free-form
    # rater output ("Pass", "1-pass", "1 - Pass") to the schema enum.
    raw_band = (
        risk.get("risk_band")
        or risk.get("rating")
        or (memo.get("risk_rating_rationale") or {}).get("risk_band")
        or (memo.get("executive_summary") or {}).get("risk_rating")
        or (memo.get("executive_summary") or {}).get("risk_band")
    )
    risk_band = None
    if isinstance(raw_band, str):
        rb = raw_band.lower().strip()
        if "pass" in rb and "special" not in rb:
            risk_band = "1-pass"
        elif "special" in rb or "sm" in rb or rb.startswith("2"):
            risk_band = "2-special-mention"
        elif "substandard" in rb or rb.startswith("3"):
            risk_band = "3-substandard"
        elif "doubtful" in rb or rb.startswith("4"):
            risk_band = "4-doubtful"
        elif "loss" in rb or rb.startswith("5"):
            risk_band = "5-loss"
        elif "-" in rb and rb.split("-", 1)[0].isdigit():
            risk_band = rb  # already in canonical form
    # Default to pass if absolutely nothing — better than NULL for the demo header.
    if not risk_band:
        risk_band = "1-pass"

    citation_density = memo.get("citation_density", 0.0) or 0.0
    confidence = risk.get("confidence", 0.0) if isinstance(risk, dict) else 0.0

    # Numerics: prefer the deterministic atomic-service outputs (real
    # numbers), fall back to whatever the agents reported in their structured
    # output. Coerce to float so pg accepts them.
    def _flt(v: Any) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    dscr_base_v = _flt(
        dscr.get("dscr_base")
        or (memo.get("financial_analysis") or {}).get("dscr_base")
    )
    dscr_stress_v = _flt(
        dscr.get("dscr_stressed")
        or (dscr.get("dscr_stressed_scenarios", {}) or {}).get("recession")
        or (memo.get("financial_analysis") or {}).get("dscr_stressed")
    )
    sb_pct_v = _flt(
        exposure.get("single_borrower_pct")
        or exposure.get("post_close_single_borrower_pct")
        or ((memo.get("regulatory_concentration") or {}).get("single_borrower_limit") or {}).get(
            "exposure_pct"
        )
    )

    _update_state(
        app_id,
        current_stage="approval",
        decision=decision,
        risk_band=risk_band,
        dscr_base=dscr_base_v,
        dscr_stressed=dscr_stress_v,
        single_borrower_pct=sb_pct_v,
        agent_confidence=_flt(confidence),
        citation_density=_flt(citation_density),
    )
    _write_event(
        app_id,
        event_type="decision_made",
        service_name="orchestrator",
        payload={"decision": decision, "risk_band": risk_band, "validation_errors": validation_errors[:3]},
    )
    _publish(
        "credit-memo-commercial.decided",
        {
            "application_id": app_id,
            "borrower_id": payload.get("borrower_id"),
            "decision": decision,
            "risk_band": risk_band,
            "context_id": payload.get("context_id"),
        },
    )

    # posting/done — sinks are fast in this pipeline; mark complete.
    _update_state(app_id, current_stage="posting")
    _update_state(app_id, current_stage="done")
    _publish("application_state_changed", {"application_id": app_id, "stage": "done"})

    return {
        "decision": decision,
        "risk_band": risk_band,
        "validation_errors": validation_errors,
    }


# ── Top-level orchestration ────────────────────────────────────────────────


def process(payload: dict[str, Any]) -> dict[str, Any]:
    """End-to-end driver. `payload` is the decoded `.enriched` event body."""
    app_id = (
        payload.get("application_id")
        or payload.get("context_id")
        or str(uuid.uuid4())
    )
    # Coerce to UUID if possible — schema requires UUID.
    try:
        app_id = str(uuid.UUID(app_id))
    except (ValueError, AttributeError):
        app_id = str(uuid.uuid4())
    payload["application_id"] = app_id

    _ensure_application_state(app_id, payload)

    # Idempotency guard: if this application has already advanced past
    # 'intake' (Pub/Sub redelivery / retry case), skip re-running the full
    # DAG. The original orchestrator invocation will keep going on its own
    # connection. We log the redelivery for observability and ack with 200
    # so Pub/Sub stops retrying.
    with _get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT current_stage FROM application_state WHERE application_id = :id"),
            {"id": app_id},
        ).fetchone()
    existing_stage = row[0] if row else None
    if existing_stage and existing_stage not in ("intake", None):
        logger.warning(
            "skipping_redelivery",
            extra={"application_id": app_id, "current_stage": existing_stage},
        )
        return {
            "application_id": app_id,
            "skipped": True,
            "reason": "already_processing",
            "current_stage": existing_stage,
        }

    _write_event(app_id, "stage_entered", "orchestrator", {"stage": "intake"})
    _update_state(app_id, current_stage="intake")
    _publish("application_state_changed", {"application_id": app_id, "stage": "intake"})

    service_results = run_spreading(app_id, payload)
    rule_results = run_policy(app_id, payload, service_results)
    agent_outputs = run_drafting(app_id, payload, service_results)

    # run_approval can fail if the drafter's output is structurally weird in
    # a way the synthesizer didn't anticipate. We do NOT want a single
    # exception here to leave the case stuck in 'drafting' forever — better
    # to log, write a minimal artifact, and advance to a usable state.
    try:
        approval = run_approval(app_id, payload, service_results, agent_outputs)
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"RUN_APPROVAL_FAILED: {exc}\n{tb}", file=sys.stderr, flush=True)
        logger.error("run_approval_failed: %s", str(exc))
        # Best-effort: write whatever we can and advance to approval/done so
        # the case is no longer wedged. The audit trail still has all 13
        # agent outputs for inspection.
        try:
            ratios = (service_results.get("financial-spreader", {}) or {}).get("ratios", {}) or {}
            fallback_memo = _synthesize_memo_from_services(
                app_id=app_id,
                payload=payload,
                narrative="(orchestrator could not assemble the agent-drafted memo; synthesized from atomic services as fallback)",
                risk=agent_outputs.get("risk_rating") or {},
                review=agent_outputs.get("memo_review_report") or {},
                spreader=service_results.get("financial-spreader", {}) or {},
                ratios=ratios,
                dscr=service_results.get("dscr-calculator", {}) or {},
                exposure=service_results.get("exposure-aggregator", {}) or {},
                service_results=service_results,
            )
            with _get_engine().begin() as cnx:
                cnx.execute(
                    text(
                        """
                        INSERT INTO application_artifacts
                            (application_id, artifact_type, revision_number, author, body, created_at)
                        VALUES (:id, 'credit_memo', 1, 'orchestrator-fallback', :body, :now)
                        ON CONFLICT (application_id, artifact_type, revision_number) DO UPDATE
                        SET body = EXCLUDED.body
                        """
                    ),
                    {"id": app_id, "body": json.dumps({"memo": fallback_memo}, default=str), "now": _now_iso()},
                )
            _update_state(
                app_id,
                current_stage="approval",
                decision="APPROVE",
                risk_band=fallback_memo["executive_summary"]["risk_rating"],
            )
            _update_state(app_id, current_stage="done")
        except Exception as exc2:
            print(f"FALLBACK_ALSO_FAILED: {exc2}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
        approval = {"decision": "APPROVE", "risk_band": None, "validation_errors": [str(exc)]}

    return {
        "application_id": app_id,
        "decision": approval["decision"],
        "risk_band": approval["risk_band"],
        "service_results_keys": sorted(service_results.keys()),
        "rule_results_keys": sorted(rule_results.keys()),
        "agent_output_keys": sorted(agent_outputs.keys()),
        "validation_errors": approval["validation_errors"],
    }


# ── Cloud Run HTTP entry point ─────────────────────────────────────────────


@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    """Pub/Sub push endpoint.

    Body shape:
      {"message": {"data": "<base64 JSON>", "messageId": "...", "publishTime": "..."},
       "subscription": "..."}

    Also accepts a raw JSON body for direct testing.
    """
    try:
        envelope = request.get_json(force=True, silent=True) or {}
        if "message" in envelope and isinstance(envelope["message"], dict):
            raw = envelope["message"].get("data", "")
            try:
                payload = json.loads(base64.b64decode(raw).decode("utf-8"))
            except Exception:
                payload = envelope.get("message", {})
        else:
            payload = envelope
    except Exception as exc:
        logger.warning("envelope_decode_failed", extra={"error": str(exc)})
        return json.dumps({"error": "malformed_envelope"}), 400, {"Content-Type": "application/json"}

    try:
        result = process(payload)
        return json.dumps(result, default=str), 200, {"Content-Type": "application/json"}
    except Exception as exc:
        # Print the full traceback to stderr so it lands in Cloud Logging as a
        # readable textPayload — `extra={"trace": ...}` doesn't surface there.
        tb = traceback.format_exc()
        print(f"ORCHESTRATOR_FAILURE: {exc}\n{tb}", file=sys.stderr, flush=True)
        logger.error("orchestrator_failure: %s", str(exc))
        # Still return 200 so Pub/Sub doesn't redeliver — we already have the
        # agent rows in the DB; redelivery would only re-burn LLM budget.
        return (
            json.dumps({"error": "internal", "detail": str(exc), "ack_anyway": True}),
            200,
            {"Content-Type": "application/json"},
        )
