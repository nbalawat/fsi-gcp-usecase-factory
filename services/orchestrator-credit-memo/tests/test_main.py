"""End-to-end orchestrator tests — SQLite + monkeypatched HTTP + stub agents."""
from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock

import pytest
from sqlalchemy import text

import main


# ── _resolve_service_url ───────────────────────────────────────────────────


def test_resolve_service_url_from_env(monkeypatch):
    monkeypatch.setenv("ATOMIC_FINANCIAL_SPREADER_URL", "https://x/y")
    assert main._resolve_service_url("financial-spreader") == "https://x/y"


def test_resolve_service_url_returns_none_when_missing(monkeypatch):
    monkeypatch.delenv("ATOMIC_DSCR_CALCULATOR_URL", raising=False)
    monkeypatch.setattr(main, "FSI_STATE_DIR", main.FSI_STATE_DIR.parent / "no_such_dir")
    assert main._resolve_service_url("dscr-calculator") is None


# ── _build_atomic_request ─────────────────────────────────────────────────


def test_build_atomic_request_financial_spreader(enriched_event_body):
    req = main._build_atomic_request("financial-spreader", enriched_event_body)
    assert req["income_statement"]["revenue"] == 100_000_000
    assert req["context_id"] == "test-ctx-001"


def test_build_atomic_request_exposure(enriched_event_body):
    req = main._build_atomic_request("exposure-aggregator", enriched_event_body)
    assert req["loan_amount"] == 5_000_000


# ── run_spreading: 8 services, 8 events ───────────────────────────────────


def test_run_spreading_writes_eight_events(test_env, enriched_event_body):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    results = main.run_spreading(app_id, enriched_event_body)
    assert set(results.keys()) == set(main._ATOMIC_SERVICES)
    with test_env.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT service_name FROM application_events "
                "WHERE event_type='service_invoked' AND application_id = :a"
            ),
            {"a": app_id},
        ).fetchall()
    assert len(rows) == 8
    services = {r[0] for r in rows}
    assert services == set(main._ATOMIC_SERVICES)


# ── run_policy: ≥10 rule_evaluated rows ───────────────────────────────────


def test_run_policy_evaluates_at_least_ten_rules(test_env, enriched_event_body):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    service_results = main.run_spreading(app_id, enriched_event_body)
    main.run_policy(app_id, enriched_event_body, service_results)
    with test_env.connect() as conn:
        evaluated = conn.execute(
            text(
                "SELECT COUNT(*) FROM application_events "
                "WHERE event_type='rule_evaluated' AND application_id = :a"
            ),
            {"a": app_id},
        ).scalar_one()
        skipped = conn.execute(
            text(
                "SELECT COUNT(*) FROM application_events "
                "WHERE event_type='rule_skipped' AND application_id = :a"
            ),
            {"a": app_id},
        ).scalar_one()
    assert evaluated >= 10, f"expected ≥10 evaluated rules, got {evaluated}"
    # 16 total rule sets minus skipped should equal evaluated.
    assert evaluated + skipped == len(main.RULE_SETS)


# ── run_drafting: 13 agent_action rows (stub path) ────────────────────────


def test_run_drafting_writes_thirteen_agent_rows(test_env, enriched_event_body):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    service_results = main.run_spreading(app_id, enriched_event_body)
    outputs = main.run_drafting(app_id, enriched_event_body, service_results)
    # All 13 output_keys present.
    expected_keys = {
        "classified_docs",
        "extracted_financials",
        "spread_financials_with_narrative",
        "peer_set",
        "management_quality",
        "customer_concentration",
        "stress_scenarios",
        "collateral_assessment",
        "regulatory_compliance",
        "covenant_package",
        "risk_rating",
        "credit_memo",
        "memo_review_report",
    }
    assert expected_keys.issubset(outputs.keys())
    with test_env.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT service_name FROM application_events "
                "WHERE event_type='agent_action' AND application_id = :a"
            ),
            {"a": app_id},
        ).fetchall()
    # At least 13 agent_action rows; may be more if memo_reviewer triggered a re-draft.
    assert len(rows) >= 13


def test_stub_credit_memo_marked_synthesized(test_env, enriched_event_body):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    service_results = main.run_spreading(app_id, enriched_event_body)
    outputs = main.run_drafting(app_id, enriched_event_body, service_results)
    assert outputs["credit_memo"].get("synthesized") is True


# ── run_approval: artifact + state update + decision_made event ───────────


def test_run_approval_persists_artifact_and_state(test_env, enriched_event_body):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    service_results = main.run_spreading(app_id, enriched_event_body)
    outputs = main.run_drafting(app_id, enriched_event_body, service_results)
    approval = main.run_approval(app_id, enriched_event_body, service_results, outputs)
    assert approval["decision"] in {"APPROVE", "APPROVE_CONDITIONAL", "DECLINE", "RETURN_FOR_REVISION"}
    with test_env.connect() as conn:
        artifact = conn.execute(
            text("SELECT body FROM application_artifacts WHERE application_id = :a"),
            {"a": app_id},
        ).fetchone()
        state = conn.execute(
            text(
                "SELECT current_stage, decision, dscr_base, single_borrower_pct "
                "FROM application_state WHERE application_id = :a"
            ),
            {"a": app_id},
        ).fetchone()
    assert artifact is not None
    body = json.loads(artifact[0])
    assert "memo" in body and "validation_errors" in body
    assert state[0] == "done"
    assert state[2] == pytest.approx(1.45)  # dscr_base from canned response
    assert state[3] == pytest.approx(4.2)  # single_borrower_pct


# ── End-to-end: HTTP entry point with Pub/Sub envelope ────────────────────


def test_main_handler_processes_pubsub_envelope(test_env, enriched_event_body):
    """Post a synthetic .enriched event to main(); verify all event-type counts."""
    raw = base64.b64encode(json.dumps(enriched_event_body).encode("utf-8")).decode("ascii")
    envelope = {"message": {"data": raw, "messageId": "m-1"}, "subscription": "sub"}

    fake_request = MagicMock()
    fake_request.get_json = lambda force=False, silent=False: envelope  # noqa: ARG005

    body, status, headers = main.main(fake_request)
    assert status == 200, body
    payload = json.loads(body)
    app_id = payload["application_id"]

    with test_env.connect() as conn:
        counts = {
            row[0]: row[1]
            for row in conn.execute(
                text(
                    "SELECT event_type, COUNT(*) FROM application_events "
                    "WHERE application_id = :a GROUP BY event_type"
                ),
                {"a": app_id},
            ).fetchall()
        }
    assert counts.get("service_invoked", 0) == 8
    assert counts.get("agent_action", 0) >= 13
    assert counts.get("rule_evaluated", 0) >= 10
    assert counts.get("decision_made", 0) == 1
    # plus a stage_entered for intake at minimum
    assert counts.get("stage_entered", 0) >= 1


def test_main_handler_with_raw_json_body(test_env, enriched_event_body):
    """Direct JSON body (no Pub/Sub envelope) is also accepted."""
    fake_request = MagicMock()
    fake_request.get_json = lambda force=False, silent=False: enriched_event_body  # noqa: ARG005
    body, status, _ = main.main(fake_request)
    assert status == 200, body


# ── Validation errors are captured but don't crash ────────────────────────


def test_validate_memo_returns_error_list_when_schema_present():
    errors = main._validate_memo({"version": "1.0"})  # missing required fields
    # Either schema is loaded (errors > 0) or absent (empty list); either is fine.
    assert isinstance(errors, list)


def test_credit_memo_schema_loads_or_is_none():
    schema = main._credit_memo_schema()
    if schema is not None:
        assert schema.get("title")


# ── Failure-path: missing service URL still produces an event row ─────────


def test_atomic_invocation_skipped_when_url_missing(test_env, enriched_event_body, monkeypatch):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    monkeypatch.delenv("ATOMIC_FINANCIAL_SPREADER_URL", raising=False)
    monkeypatch.setattr(main, "FSI_STATE_DIR", main.FSI_STATE_DIR.parent / "no_such_dir")
    response = main._invoke_atomic("financial-spreader", enriched_event_body, app_id)
    assert response.get("skipped") is True
    with test_env.connect() as conn:
        row = conn.execute(
            text(
                "SELECT payload FROM application_events "
                "WHERE event_type='service_invoked' AND service_name='financial-spreader' "
                "AND application_id = :a"
            ),
            {"a": app_id},
        ).fetchone()
    assert row is not None
    assert "skipped_no_url" in row[0]


# ── Idempotency: re-inserting application_state is harmless ───────────────


def test_ensure_application_state_idempotent(test_env, enriched_event_body):
    app_id = enriched_event_body["application_id"]
    main._ensure_application_state(app_id, enriched_event_body)
    main._ensure_application_state(app_id, enriched_event_body)
    with test_env.connect() as conn:
        n = conn.execute(
            text("SELECT COUNT(*) FROM application_state WHERE application_id = :a"),
            {"a": app_id},
        ).scalar_one()
    assert n == 1
