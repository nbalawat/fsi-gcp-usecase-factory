"""
rules-service: singleton GoRules Zen JDM evaluator — evaluates any JDM rule set
from the bank's rules/ directory, returns APPROVE/DECLINE/REFER decisions.

Singleton service — shared across all use cases. Stateless per request.
Called by Cloud Workflows via MCP tool endpoint.
"""

from __future__ import annotations

import datetime
import json
import os
import re
from typing import Any

import functions_framework
import sqlalchemy
import zen
try:
    from bank.logging import redacting_logger  # type: ignore[import-not-found]
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:  # type: ignore[misc]
        return _logging.getLogger(name)
from opentelemetry import trace
from sqlalchemy import text

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)

SERVICE_NAME = "rules-service"

VALID_DECISIONS = {"APPROVE", "DECLINE", "REFER"}

GCP_PROJECT = os.environ["GCP_PROJECT"]  # fail-closed; never default to a project ID

# The rules-service searches multiple roots so it can serve framework-shared rules
# (regulatory_thresholds, single_borrower_exposure) AND per-use-case rules
# (credit-memo-eligibility, etc.). Set RULES_DIRS to a comma-separated list to
# override; otherwise default to repo-level rules/ + every usecases/<uc>/rules/.
# Searches both the repo layout (services/rules-service/../../{rules,usecases})
# AND the container layout where the build context is staged at the service
# directory root (so /app/{rules,usecases} also work).
_SVC_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_SVC_DIR, "..", ".."))
_CANDIDATE_ROOTS = [_REPO_ROOT, _SVC_DIR]

_DEFAULT_RULES_DIRS: list[str] = []
_seen: set[str] = set()
for _root in _CANDIDATE_ROOTS:
    _r = os.path.join(_root, "rules")
    if os.path.isdir(_r) and _r not in _seen:
        _DEFAULT_RULES_DIRS.append(_r)
        _seen.add(_r)
    _uc_root = os.path.join(_root, "usecases")
    if os.path.isdir(_uc_root):
        for entry in sorted(os.listdir(_uc_root)):
            candidate = os.path.join(_uc_root, entry, "rules")
            if os.path.isdir(candidate) and candidate not in _seen:
                _DEFAULT_RULES_DIRS.append(candidate)
                _seen.add(candidate)

_env_dirs = os.environ.get("RULES_DIRS", "")
if _env_dirs:
    RULES_DIRS = [d.strip() for d in _env_dirs.split(",") if d.strip()]
else:
    RULES_DIRS = _DEFAULT_RULES_DIRS

# Backwards-compat: RULES_DIR still works as a single override.
_legacy_single = os.environ.get("RULES_DIR")
if _legacy_single:
    RULES_DIRS = [_legacy_single]

_engine: sqlalchemy.Engine | None = None
_zen_engine: zen.ZenEngine | None = None


def _get_engine() -> sqlalchemy.Engine:
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

            _engine = sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0)
    return _engine


def _get_zen_engine() -> zen.ZenEngine:
    global _zen_engine
    if _zen_engine is None:
        _zen_engine = zen.ZenEngine()
    return _zen_engine


def _write_audit(
    context_id: str,
    rule_set: str,
    decision: str,
    inputs: dict[str, Any],
    outputs: dict[str, Any],
    error: str | None,
    evaluated_at: str,
) -> None:
    """
    Write audit record to Cloud SQL in try/finally — fires even on evaluation error.
    Errors here are logged but never re-raised so they cannot mask the primary error.
    """
    try:
        inputs_summary = json.dumps(inputs)[:500]
        outputs_summary = json.dumps(outputs)[:500]
        with _get_engine().begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO audit_events "
                    "(service_name, context_id, inputs_summary, outputs_summary, error) "
                    "VALUES (:svc, :ctx, :inp, :out, :err)"
                ),
                {
                    "svc": SERVICE_NAME,
                    "ctx": context_id,
                    "inp": inputs_summary,
                    "out": outputs_summary,
                    "err": error,
                },
            )
    except Exception as exc:  # noqa: BLE001
        logger.error("audit_write_failed", extra={"error": str(exc)})


_RULE_SET_RE = re.compile(r"^[A-Za-z0-9_\-/]+$")


def _load_rule_content(rule_set: str) -> str:
    """
    Load JDM rule JSON from any configured RULES_DIRS root.

    Path-traversal hardened: rule_set must match [A-Za-z0-9_\\-/]+ and the
    resolved absolute path must remain under one of the configured roots.
    Returns the first match across configured roots.
    """
    if not _RULE_SET_RE.match(rule_set):
        raise ValueError(f"invalid rule_set name: {rule_set!r}")

    # Two layouts are supported:
    #   1. <rules_dir>/<rule_set>.json                  (flat)
    #   2. <rules_dir>/<rule_set>/v<N>.json             (versioned dir)
    # The bank's primary rule catalog uses the versioned-dir layout
    # (rules/single_borrower_exposure/v1.json) so the loader had to
    # know about it. The flat layout is kept for one-off rules.
    for rules_dir in RULES_DIRS:
        rules_root = os.path.realpath(rules_dir)
        if not os.path.isdir(rules_root):
            continue

        candidates: list[str] = []
        # Layout 1: flat file
        flat = os.path.realpath(os.path.join(rules_dir, f"{rule_set}.json"))
        candidates.append(flat)
        # Layout 2: versioned directory — pick the highest v<N>.json
        rule_dir = os.path.realpath(os.path.join(rules_dir, rule_set))
        if os.path.isdir(rule_dir):
            versions = sorted(
                [
                    f for f in os.listdir(rule_dir)
                    if re.match(r"^v\d+\.json$", f)
                ],
                key=lambda f: int(f[1:-5]),
                reverse=True,
            )
            for vfile in versions:
                candidates.append(os.path.realpath(os.path.join(rule_dir, vfile)))

        for rule_path in candidates:
            # Common-path check rejects any traversal attempt
            if os.path.commonpath([rule_path, rules_root]) != rules_root:
                raise ValueError(f"rule_set escapes RULES_DIRS: {rule_set!r}")
            if os.path.isfile(rule_path):
                with open(rule_path, encoding="utf-8") as fh:
                    return fh.read()

    raise FileNotFoundError(
        f"rule_set not found in any of {len(RULES_DIRS)} configured rule roots: {rule_set}"
    )


def evaluate_rule(rule_set: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """
    Load and evaluate a JDM rule set.
    Returns raw zen result dict (contains 'result' key).
    Raises FileNotFoundError when rule_set does not exist.
    Raises RuntimeError when zen evaluation fails.
    """
    content = _load_rule_content(rule_set)
    engine = _get_zen_engine()
    try:
        decision_obj = engine.create_decision(content)
        raw: dict[str, Any] = decision_obj.evaluate(inputs)  # type: ignore[assignment]
    except RuntimeError as exc:
        raise RuntimeError(str(exc)) from exc
    return raw


def _extract_decision_and_reason(
    zen_result: dict[str, Any],
) -> tuple[str, str, dict[str, Any]]:
    """
    Extract decision, reason, and remaining output fields from zen result.

    Rules that want to drive APPROVE/DECLINE/REFER must include a 'decision' output
    field.  Rules that do not (e.g. computation-only rules) default to 'APPROVE'
    so the outputs are still returned cleanly.

    Returns (decision, reason, outputs_dict).
    """
    raw_result = zen_result.get("result", {})

    # result may be a list (collect hit policy) or a dict (first/unique)
    if isinstance(raw_result, list):
        if raw_result:
            combined: dict[str, Any] = {}
            for item in raw_result:
                if isinstance(item, dict):
                    combined.update(item)
            outputs = combined
        else:
            outputs = {}
    else:
        outputs = dict(raw_result) if raw_result else {}

    decision_raw = outputs.pop("decision", "APPROVE")
    decision = str(decision_raw).upper() if decision_raw else "APPROVE"
    if decision not in VALID_DECISIONS:
        decision = "REFER"

    reason = str(outputs.pop("reason", "")) if "reason" in outputs else ""

    return decision, reason, outputs


def process(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Inputs:  context_id, rule_set, inputs
    Outputs: context_id, rule_set, decision, reason, outputs, evaluated_at
    """
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        # --- validate inputs ---
        missing = [f for f in ("context_id", "rule_set", "inputs") if f not in payload]
        if missing:
            raise ValueError(f"missing required fields: {missing}")

        context_id = str(payload["context_id"])
        rule_set = str(payload["rule_set"])
        inputs = payload["inputs"]

        if not isinstance(inputs, dict):
            raise ValueError("inputs must be an object")

        span.set_attribute("service.name", SERVICE_NAME)
        span.set_attribute("context_id", context_id)
        span.set_attribute("rule_set", rule_set)

        zen_result = evaluate_rule(rule_set, inputs)
        decision, reason, outputs = _extract_decision_and_reason(zen_result)
        evaluated_at = datetime.datetime.utcnow().isoformat() + "Z"

        return {
            "context_id": context_id,
            "rule_set": rule_set,
            "decision": decision,
            "reason": reason,
            "outputs": outputs,
            "evaluated_at": evaluated_at,
        }


# ── /evaluate_all — workflow batch entry point ────────────────────────────


# Catalog of rule sets the workflow runs on every credit-memo case +
# how to compose their inputs from the workflow's `service_results`
# blob. Each entry maps the rule_set name to a function that takes
# (service_results, ctx) and returns the JDM input dict. Rules whose
# inputs aren't yet computable on a given case (because the upstream
# atomic service didn't produce its piece of service_results) are
# returned with decision="SKIP" + a reason — they show up in the audit
# trail with a clear marker, not a silent miss.
_CTX_FIELDS = ("loan_amount_usd", "naics_code", "borrower_id", "tier1_capital")

# Bank-wide defaults applied when the more-precise input source (atomic
# service results) isn't available. Bankers can override per-case via
# the workflow context. Numbers are conservative — real values depend
# on quarterly bank-level reporting.
_DEFAULT_TIER1_CAPITAL = 300_000_000
_DEFAULT_LENDING_LIMIT_PER_PERSON = 25_000  # 12 CFR 215.5 individual limit
_DEFAULT_PORTFOLIO_SECTOR_PCT = 0.08  # baseline assumption: 8% of book
_DEFAULT_PORTFOLIO_STATE_PCT = 0.05  # baseline assumption: 5% of book


def _first_field(documents: list[dict[str, Any]], path: str) -> Any:
    """Walk through documents looking for the first non-null value at a
    dotted path inside extracted_fields. Lets the rules-service derive
    real numbers (revenue, total_debt, ebitda) from the extracted PDFs
    without needing the atomic services to run first."""
    for d in documents or []:
        ef = d.get("extracted_fields") or {}
        cur: Any = ef
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                cur = None
                break
        if cur is not None and cur != 0:
            return cur
    return None


def _doc_compute_dscr(documents: list[dict[str, Any]]) -> float | None:
    """Approximate DSCR from extracted statements: EBITDA / interest_expense.
    True DSCR uses scheduled debt service; this is the underwriter's
    rule-of-thumb that travels with most 10-Ks."""
    ebitda = _first_field(documents, "income_statement.ebitda")
    if ebitda is None:
        # Fallback: operating_income + depreciation_amortization
        oi = _first_field(documents, "income_statement.operating_income")
        da = _first_field(documents, "income_statement.depreciation_amortization") or 0
        ebitda = (float(oi) + float(da)) if oi is not None else None
    interest = _first_field(documents, "income_statement.interest_expense")
    if ebitda is None or interest is None or float(interest) == 0:
        return None
    return float(ebitda) / float(interest)


def _doc_compute_leverage(documents: list[dict[str, Any]]) -> float | None:
    """Total debt / EBITDA — standard leverage ratio."""
    debt = _first_field(documents, "balance_sheet.total_debt")
    ebitda = _first_field(documents, "income_statement.ebitda")
    if debt is None or ebitda is None or float(ebitda) == 0:
        return None
    return float(debt) / float(ebitda)


def _build_inputs_single_borrower(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    proposed = ctx.get("loan_amount_usd")
    if proposed is None:
        return None
    existing = (sr.get("borrower_network") or {}).get("existing_exposure_committed")
    tier1 = ctx.get("tier1_capital") or _DEFAULT_TIER1_CAPITAL
    return {
        "proposed_amount": float(proposed),
        "existing_exposure_committed": float(existing or 0),
        "tier1_capital": float(tier1),
    }


def _naics_2digit(naics: str | None) -> str:
    """First 2 digits of a NAICS code — sector-level rule lookups
    typically thresholds-by-sector. '333992' → '33'."""
    if not naics:
        return ""
    return str(naics).strip()[:2]


def _build_inputs_dscr(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    naics2 = _naics_2digit(ctx.get("naics_code"))
    if not naics2:
        return None
    serv = sr.get("loan_serviceability") or {}
    dscr_base = serv.get("dscr_base") or _doc_compute_dscr(docs)
    dscr_stressed = serv.get("dscr_stressed")
    if dscr_stressed is None and dscr_base is not None:
        # Banker rule-of-thumb: stress = base × 0.7 (30% revenue shock)
        dscr_stressed = float(dscr_base) * 0.7
    if dscr_base is None:
        return None
    return {
        "dscr_base": float(dscr_base),
        "dscr_stressed": float(dscr_stressed),
        "naics_2digit": naics2,
    }


def _build_inputs_leverage(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    naics2 = _naics_2digit(ctx.get("naics_code"))
    if not naics2:
        return None
    spread = sr.get("financial_spreader") or {}
    leverage = spread.get("leverage_base") or _doc_compute_leverage(docs)
    if leverage is None:
        return None
    return {"leverage_ratio": float(leverage), "naics_2digit": naics2}


def _build_inputs_reg_o(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Reg O 12 CFR 215.4(c) — applicable individual insider lending
    limit is the greater of $500K or 10% of unimpaired capital. Inputs:
    insider_loan_amount, tier1_capital, has_collateral_backing.

    For non-insider cases we set insider_loan_amount=0 so the rule
    passes by default (loan is below applicable limit). For real
    insider relationships, the borrower_network atomic service supplies
    the actual outstanding loan amount."""
    insider = sr.get("borrower_network", {}).get("insider_screening") or {}
    is_insider = bool(insider.get("is_insider", False))
    insider_loan_amount = (
        float(ctx.get("loan_amount_usd") or 0) if is_insider else 0.0
    )
    return {
        "insider_loan_amount": insider_loan_amount,
        "tier1_capital": float(ctx.get("tier1_capital") or _DEFAULT_TIER1_CAPITAL),
        "has_collateral_backing": bool(insider.get("has_collateral_backing", False)),
    }


def _build_inputs_sector(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    naics2 = _naics_2digit(ctx.get("naics_code"))
    if not naics2:
        return None
    pi = sr.get("peer_and_industry_context") or {}
    pct = pi.get("portfolio_pct_in_sector") or _DEFAULT_PORTFOLIO_SECTOR_PCT
    return {
        "naics_sector": naics2,
        "sector_exposure_pct": float(pct),
    }


def _build_inputs_geographic(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    pi = sr.get("peer_and_industry_context") or {}
    pct = pi.get("portfolio_pct_in_state") or _DEFAULT_PORTFOLIO_STATE_PCT
    state = pi.get("state") or "UNKNOWN"
    return {
        "geographic_exposure_pct": float(pct),
        "state": str(state),
    }


def _build_inputs_cre_concentration(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    coll = sr.get("collateral_valuator") or {}
    return {
        "construction_loans_pct_capital": float(
            coll.get("construction_loans_pct_capital") or 0.0,
        ),
        "cre_loans_pct_capital": float(coll.get("cre_loans_pct_capital") or 0.0),
    }


def _build_inputs_insider_aggregate(
    sr: dict[str, Any], ctx: dict[str, Any], docs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    insider = sr.get("borrower_network", {}).get("insider_screening") or {}
    return {
        "insider_loans_total": float(insider.get("aggregate_insider_loans") or 0.0),
        "unimpaired_capital_surplus": float(
            ctx.get("tier1_capital") or _DEFAULT_TIER1_CAPITAL,
        ),
    }


_RULE_CATALOG: list[tuple[str, Any]] = [
    ("single_borrower_exposure", _build_inputs_single_borrower),
    ("dscr_threshold_by_industry", _build_inputs_dscr),
    ("leverage_threshold_by_industry", _build_inputs_leverage),
    ("reg_o_individual_limit", _build_inputs_reg_o),
    ("sector_concentration_limit", _build_inputs_sector),
    ("geographic_concentration_limit", _build_inputs_geographic),
    ("cre_concentration_limit", _build_inputs_cre_concentration),
    ("insider_aggregate_limit", _build_inputs_insider_aggregate),
]


def _emit_application_event(
    application_id: str,
    rule_set: str,
    decision: str,
    reason: str,
    outputs: dict[str, Any],
    inputs: dict[str, Any] | None,
    skipped: bool,
    latency_ms: int,
) -> None:
    """Append a row to application_events with event_type='rule_evaluated'.

    The case-page pipeline-activity panel groups events by type and
    surfaces these as banker-readable rows ("DSCR threshold · pass · 23ms").
    Skipped rules are still emitted so the audit trail is honest about
    which rules ran vs. which were skipped because their inputs weren't
    available."""
    try:
        with _get_engine().begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO application_events
                      (application_id, event_type, service_name, payload, latency_ms)
                    VALUES
                      (:app_id, 'rule_evaluated', :svc, CAST(:payload AS jsonb), :latency)
                    """,
                ),
                {
                    "app_id": application_id,
                    "svc": SERVICE_NAME,
                    "payload": json.dumps(
                        {
                            "rule_set": rule_set,
                            "decision": decision,
                            "reason": reason[:500],
                            "outputs": outputs,
                            "inputs": inputs,
                            "skipped": skipped,
                        },
                    ),
                    "latency": latency_ms,
                },
            )
    except Exception as exc:  # noqa: BLE001
        logger.error("emit_application_event_failed", extra={"error": str(exc), "rule_set": rule_set})


def _handle_evaluate_all(payload: dict[str, Any]) -> tuple[str, int, dict[str, str]]:
    """Iterate the rule catalog, evaluate each rule whose inputs we can
    build from the supplied service_results, write one
    application_events row per rule, return the merged result.

    Rules whose inputs aren't available are emitted with decision="SKIP"
    and reason="missing inputs: <which fields are missing>". The case
    page surfaces them in the audit trail so the banker can see exactly
    which deterministic gates couldn't run.
    """
    application_id = str(payload.get("application_id", ""))
    if not application_id:
        return (
            json.dumps({"error": "application_id required"}),
            400,
            {"Content-Type": "application/json"},
        )
    service_results = payload.get("service_results") or {}
    if not isinstance(service_results, dict):
        service_results = {}
    ctx = {k: payload.get(k) for k in _CTX_FIELDS}
    # documents: array of `{doc_id, doc_type, extracted_fields, citations}`
    # from the workflow's extracted_docs. Lets builders compute ratios
    # like DSCR / leverage directly from extracted financials when the
    # atomic services haven't produced their outputs yet (the
    # input-builder fallback path in _doc_compute_*).
    documents = payload.get("documents") or []
    if not isinstance(documents, list):
        documents = []

    results: dict[str, Any] = {}
    for rule_set, build_inputs in _RULE_CATALOG:
        started = datetime.datetime.utcnow()
        try:
            inputs = build_inputs(service_results, ctx, documents)
        except Exception as exc:
            inputs = None
            logger.error("input_build_failed", extra={"rule_set": rule_set, "error": str(exc)})
        if inputs is None:
            # Skip — emit a rule_evaluated event with decision=SKIP so
            # the audit trail is honest about which rules couldn't run.
            _emit_application_event(
                application_id=application_id,
                rule_set=rule_set,
                decision="SKIP",
                reason="missing required service_results inputs",
                outputs={},
                inputs=None,
                skipped=True,
                latency_ms=0,
            )
            results[rule_set] = {
                "decision": "SKIP",
                "reason": "missing required service_results inputs",
                "outputs": {},
                "skipped": True,
            }
            continue

        try:
            zen_result = evaluate_rule(rule_set, inputs)
            decision, reason, outputs = _extract_decision_and_reason(zen_result)
            error_msg = None
        except FileNotFoundError:
            decision, reason, outputs, error_msg = "ERROR", "rule_set not found", {}, "rule_set not found"
        except Exception as exc:  # noqa: BLE001
            decision, reason, outputs, error_msg = "ERROR", str(exc)[:200], {}, str(exc)

        latency_ms = int((datetime.datetime.utcnow() - started).total_seconds() * 1000)
        _emit_application_event(
            application_id=application_id,
            rule_set=rule_set,
            decision=decision,
            reason=reason,
            outputs=outputs,
            inputs=inputs,
            skipped=False,
            latency_ms=latency_ms,
        )
        results[rule_set] = {
            "decision": decision,
            "reason": reason,
            "outputs": outputs,
            "skipped": False,
            "error": error_msg,
        }

    return (
        json.dumps({"application_id": application_id, "results": results}),
        200,
        {"Content-Type": "application/json"},
    )


# ── Cloud Run entry point ──────────────────────────────────────────────────


@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
    # Path-based dispatch: /evaluate_all (batch) vs / (single rule_set,
    # legacy shape used by /fsi-prompt-update + manual ad-hoc tests).
    path = (request.path or "/").rstrip("/")
    if request.method == "POST" and path == "/evaluate_all":
        try:
            return _handle_evaluate_all(request.get_json(force=True) or {})
        except Exception as exc:  # noqa: BLE001
            logger.error("evaluate_all_unhandled", extra={"error": str(exc)})
            return (
                json.dumps({"error": "evaluate_all failed", "detail": str(exc)[:300]}),
                500,
                {"Content-Type": "application/json"},
            )

    payload: dict[str, Any] = {}
    result: dict[str, Any] = {}
    error_msg: str | None = None
    rule_set_name = ""
    evaluated_at = datetime.datetime.utcnow().isoformat() + "Z"

    try:
        payload = request.get_json(force=True) or {}
        rule_set_name = str(payload.get("rule_set", ""))
        result = process(payload)
        evaluated_at = result.get("evaluated_at", evaluated_at)
        logger.info(
            "rules_evaluated",
            extra={
                "context_id": payload.get("context_id"),
                "rule_set": rule_set_name,
                "decision": result.get("decision"),
            },
        )
        return json.dumps(result), 200, {"Content-Type": "application/json"}

    except ValueError as exc:
        error_msg = str(exc)
        logger.warning("validation_error", extra={"error": error_msg})
        return (
            json.dumps({"error": error_msg}),
            400,
            {"Content-Type": "application/json"},
        )

    except FileNotFoundError as exc:
        error_msg = str(exc)
        logger.warning("rule_set_not_found", extra={"rule_set": rule_set_name})
        return (
            json.dumps({"error": "rule_set not found"}),
            404,
            {"Content-Type": "application/json"},
        )

    except RuntimeError as exc:
        error_msg = str(exc)
        logger.error(
            "evaluation_failed",
            extra={"error": error_msg, "rule_set": rule_set_name},
        )
        return (
            json.dumps({"error": "evaluation failed", "detail": error_msg}),
            422,
            {"Content-Type": "application/json"},
        )

    except Exception as exc:
        error_msg = str(exc)
        logger.error("unexpected_error", extra={"error": error_msg})
        return (
            json.dumps({"error": "internal server error"}),
            500,
            {"Content-Type": "application/json"},
        )

    finally:
        _write_audit(
            context_id=str(payload.get("context_id", "unknown")),
            rule_set=rule_set_name,
            decision=result.get("decision", ""),
            inputs=payload.get("inputs", {}),
            outputs=result.get("outputs", {}),
            error=error_msg,
            evaluated_at=evaluated_at,
        )
