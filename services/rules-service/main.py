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
from bank.logging import redacting_logger  # type: ignore[import-not-found]
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
_REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
_DEFAULT_RULES_DIRS = [
    os.path.join(_REPO_ROOT, "rules"),
]
# Auto-discover per-use-case rule directories at startup.
_uc_root = os.path.join(_REPO_ROOT, "usecases")
if os.path.isdir(_uc_root):
    for entry in sorted(os.listdir(_uc_root)):
        candidate = os.path.join(_uc_root, entry, "rules")
        if os.path.isdir(candidate):
            _DEFAULT_RULES_DIRS.append(candidate)

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
    for rules_dir in RULES_DIRS:
        rules_root = os.path.realpath(rules_dir)
        if not os.path.isdir(rules_root):
            continue
        rule_path = os.path.realpath(os.path.join(rules_dir, f"{rule_set}.json"))
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


# ── Cloud Run entry point ──────────────────────────────────────────────────


@functions_framework.http
def main(request):  # type: ignore[no-untyped-def]
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
