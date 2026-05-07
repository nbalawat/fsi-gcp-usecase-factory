"""
End-to-end tests for credit-memo-commercial.

Layer 5 tests: run against local emulator stack (PUBSUB_EMULATOR_HOST must be set).
Layer 6 tests (marked @live): run against the dev GCP project / real Cloud Run endpoints.

Run Layer 5 only:  pytest usecases/credit-memo-commercial/tests/ -m "not live"
Run Layer 6 only:  pytest usecases/credit-memo-commercial/tests/ -m live

Scenarios
---------
1. happy-path-approve                         — healthy borrower, all ratios pass, APPROVE
2. rated-substandard-decline                  — DSCR < 1.0 at close, DECLINE
3. exposure-limit-decline                     — single-borrower concentration > 15% Tier 1, DECLINE
4. covenant-projection-violation-return-for-revision — seasonal trough breach, RETURN_FOR_REVISION
5. regulatory-clock-breach-alarm              — pipeline stall at T+4d22h, P1 alarm fires

Each scenario has a corresponding fixture in fixtures/ and LLM stubs in llm_fixtures/.
Tests assert on output *shape and values*, not on exact LLM prose.
"""
from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path
from typing import Any

import pytest
import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

FIXTURE_DIR = Path(__file__).parent / "fixtures"
LLM_FIXTURE_DIR = Path(__file__).parent / "llm_fixtures"

# ---------------------------------------------------------------------------
# Deployed endpoint constants (mirrored from conftest)
# ---------------------------------------------------------------------------

_HANDLER_URL = "https://fsi-handler-credit-memo-commercial-v4uibzu6ga-uc.a.run.app"
_PUBSUB_TOPIC = "projects/agentic-experiments/topics/loans.application.submitted"
_EMULATOR_BASE = os.getenv("PUBSUB_EMULATOR_HOST", "localhost:8085")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_fixture(name: str) -> dict[str, Any]:
    """Load a JSON fixture by filename stem (no extension)."""
    path = FIXTURE_DIR / f"{name}.json"
    return json.loads(path.read_text())


def _load_llm_fixture(name: str) -> dict[str, Any]:
    """Load an LLM stub fixture by filename stem (no extension)."""
    path = LLM_FIXTURE_DIR / f"{name}.json"
    return json.loads(path.read_text())


def _pubsub_envelope(payload: dict[str, Any], message_id: str = "test-msg-001") -> dict[str, Any]:
    """Wrap an event payload in a Pub/Sub push envelope."""
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return {
        "message": {
            "data": encoded,
            "messageId": message_id,
            "publishTime": "2026-05-06T00:00:00Z",
        },
        "subscription": f"projects/agentic-experiments/subscriptions/credit-memo-handler-sub",
    }


def _submit_to_emulator(payload: dict[str, Any]) -> str:
    """Submit an event payload to the local Pub/Sub emulator.  Returns message_id."""
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    resp = requests.post(
        f"http://{_EMULATOR_BASE}/v1/projects/test-project/topics/loans.application.submitted:publish",
        json={"messages": [{"data": encoded}]},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["messageIds"][0]


def _submit_to_handler(
    payload: dict[str, Any],
    token: str | None = None,
    message_id: str = "test-msg-001",
) -> requests.Response:
    """Submit a Pub/Sub envelope directly to the Cloud Run handler endpoint."""
    envelope = _pubsub_envelope(payload, message_id=message_id)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(_HANDLER_URL, json=envelope, headers=headers, timeout=30)


def _poll_result(context_id: str, timeout_s: int = 60) -> dict[str, Any]:
    """Poll for workflow completion.  Returns the final output or raises TimeoutError.

    TODO: replace stub with real workflow-state endpoint once deployed.
    """
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        # TODO: GET /v1/workflows/{context_id}/result from workflow orchestrator
        time.sleep(2)
    raise TimeoutError(f"context_id {context_id!r} did not complete within {timeout_s}s")


def _assert_handler_response(resp: requests.Response, context_id: str) -> None:
    """Common assertions on the handler HTTP response."""
    assert resp.status_code == 200, (
        f"Handler returned {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    assert body.get("status") == "ok", f"Unexpected status: {body}"
    assert body.get("context_id") == context_id, (
        f"context_id mismatch: expected {context_id!r}, got {body.get('context_id')!r}"
    )


# ---------------------------------------------------------------------------
# Scenario 1 — happy-path-approve
# ---------------------------------------------------------------------------


def test_happy_path_approve() -> None:
    """happy-path-approve — healthy borrower, strong DSCR, loan within exposure limits, expects APPROVE recommendation."""
    fixture = _load_fixture("happy_path_approve")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    # Validate fixture shape
    assert event_payload["borrower_id"] == "DEMO-MFG-001"
    assert event_payload["loan_amount"] == 8_000_000
    assert event_payload["loan_type"] == "term"

    # Load LLM stubs and verify their shapes
    drafter_stub = _load_llm_fixture("drafter_happy_path_approve")
    memo = drafter_stub["output_value"]
    assert memo["recommendation"] == "APPROVE"
    assert memo["risk_band"] == "1-pass"
    assert memo["word_count"] <= 1500
    assert memo["citation_density"] >= 0.8
    assert memo["approval_authority"] == "senior-credit-committee"

    rater_stub = _load_llm_fixture("rater_happy_path_approve")
    rating = rater_stub["output_value"]
    assert rating["risk_band"] == "1-pass"
    assert rating["dscr_base"] >= 1.25
    assert rating["exposure_limit_flag"] is False
    assert rating["covenant_violation_flag"] is False

    extractor_stub = _load_llm_fixture("extractor_happy_path_approve")
    extracted = extractor_stub["output_value"]
    assert extracted["financial_statement_type"] == "audited"
    assert extracted["extraction_confidence"] >= 0.90

    # Verify expected outcome in fixture matches stub assertions
    expected = fixture["expected_outcome"]
    assert expected["status"] == "approved"
    assert expected["risk_band"] == "1-pass"

    pytest.skip(
        "TODO: wire to emulator — set PUBSUB_EMULATOR_HOST and remove this skip"
    )


@pytest.mark.live
def test_happy_path_approve_live(oidc_token: str, live_endpoints: dict[str, str]) -> None:
    """happy-path-approve against real GCP — healthy borrower expects APPROVE from deployed stack."""
    fixture = _load_fixture("happy_path_approve")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    resp = _submit_to_handler(event_payload, token=oidc_token, message_id=context_id)
    _assert_handler_response(resp, context_id)

    # TODO: poll workflow result endpoint once deployed
    # result = _poll_result(context_id, timeout_s=120)
    # assert result["recommendation"] == "APPROVE"
    # assert result["risk_band"] == "1-pass"
    # assert result["word_count"] <= 1500
    # assert result["citation_density"] >= 0.8
    pytest.skip("TODO: poll workflow result endpoint for live assertion")


# ---------------------------------------------------------------------------
# Scenario 2 — rated-substandard-decline
# ---------------------------------------------------------------------------


def test_rated_substandard_decline() -> None:
    """rated-substandard-decline — weak DSCR (<1.0) and poor covenant headroom triggers DECLINE with risk band 3-substandard."""
    fixture = _load_fixture("rated_substandard_decline")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    assert event_payload["borrower_id"] == "DEMO-MFG-002"
    assert event_payload["loan_amount"] == 5_000_000
    assert event_payload["projected_post_close_ratios"]["dscr_base"] < 1.0

    drafter_stub = _load_llm_fixture("drafter_rated_substandard_decline")
    memo = drafter_stub["output_value"]
    assert memo["recommendation"] == "DECLINE"
    assert memo["risk_band"] == "3-substandard"
    assert len(memo["decline_reasons"]) >= 3
    assert memo["citation_density"] >= 0.8

    rater_stub = _load_llm_fixture("rater_rated_substandard_decline")
    rating = rater_stub["output_value"]
    assert rating["risk_band"] == "3-substandard"
    assert rating["dscr_base"] < 1.0
    assert rating["covenant_violation_flag"] is True

    expected = fixture["expected_outcome"]
    assert expected["status"] == "declined"
    assert expected["risk_band"] == "3-substandard"

    pytest.skip(
        "TODO: wire to emulator — set PUBSUB_EMULATOR_HOST and remove this skip"
    )


@pytest.mark.live
def test_rated_substandard_decline_live(oidc_token: str, live_endpoints: dict[str, str]) -> None:
    """rated-substandard-decline against real GCP — DSCR breach at inception should produce DECLINE."""
    fixture = _load_fixture("rated_substandard_decline")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    resp = _submit_to_handler(event_payload, token=oidc_token, message_id=context_id)
    _assert_handler_response(resp, context_id)

    # TODO: poll workflow result endpoint once deployed
    # result = _poll_result(context_id, timeout_s=120)
    # assert result["recommendation"] == "DECLINE"
    # assert result["risk_band"] == "3-substandard"
    # assert result["dscr_base"] < 1.0
    # assert result["min_dscr_breach"] is True
    # assert len(result["decline_reasons"]) >= 3
    pytest.skip("TODO: poll workflow result endpoint for live assertion")


# ---------------------------------------------------------------------------
# Scenario 3 — exposure-limit-decline
# ---------------------------------------------------------------------------


def test_exposure_limit_decline() -> None:
    """exposure-limit-decline — single-borrower exposure >15% Tier 1 capital triggers DECLINE even though credit quality is 1-pass."""
    fixture = _load_fixture("exposure_limit_decline")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    assert event_payload["borrower_id"] == "DEMO-HLT-001"
    assert event_payload["loan_amount"] == 15_000_000

    injected = event_payload["injected_exposure_state"]
    assert injected["single_borrower_pct_post_close"] > injected["single_borrower_limit_pct"]

    drafter_stub = _load_llm_fixture("drafter_exposure_limit_decline")
    memo = drafter_stub["output_value"]
    assert memo["recommendation"] == "DECLINE"
    # Critical: credit quality is 1-pass despite decline
    assert memo["risk_band"] == "1-pass", (
        "Exposure-limit decline must preserve 1-pass credit rating — "
        "the decline is driven by regulatory limit, not credit quality"
    )
    assert memo["approval_authority"] == "board-risk-committee"
    # Regulatory citation must be present
    regulatory_cites = memo.get("regulatory_citations", [])
    assert any("12 CFR 32" in cite for cite in regulatory_cites), (
        "Credit memo must cite OCC 12 CFR Part 32 for exposure limit breach"
    )
    # At least one decline reason must reference exposure
    decline_reasons = memo.get("decline_reasons", [])
    assert any("exposure" in reason.lower() for reason in decline_reasons)

    rater_stub = _load_llm_fixture("rater_exposure_limit_decline")
    rating = rater_stub["output_value"]
    assert rating["risk_band"] == "1-pass"
    assert rating["exposure_limit_flag"] is True
    assert rating["dscr_base"] >= 1.25

    expected = fixture["expected_outcome"]
    assert expected["status"] == "declined"
    assert expected["risk_band"] == "1-pass"
    assert expected["decline_reason"] == "single-borrower-exposure-limit-breach"

    pytest.skip(
        "TODO: wire to emulator — set PUBSUB_EMULATOR_HOST and remove this skip"
    )


@pytest.mark.live
def test_exposure_limit_decline_live(oidc_token: str, live_endpoints: dict[str, str]) -> None:
    """exposure-limit-decline against real GCP — exposure rule must gate independently of 1-pass credit quality."""
    fixture = _load_fixture("exposure_limit_decline")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    resp = _submit_to_handler(event_payload, token=oidc_token, message_id=context_id)
    _assert_handler_response(resp, context_id)

    # TODO: poll workflow result endpoint once deployed
    # result = _poll_result(context_id, timeout_s=120)
    # assert result["recommendation"] == "DECLINE"
    # assert result["risk_band"] == "1-pass"
    # assert result["single_borrower_exposure"]["limit_status"] == "BREACH"
    # assert result["single_borrower_exposure"]["single_borrower_pct"] > 0.08
    # assert any("12 CFR 32" in cite for cite in result.get("regulatory_citations", []))
    pytest.skip("TODO: poll workflow result endpoint for live assertion")


# ---------------------------------------------------------------------------
# Scenario 4 — covenant-projection-violation-return-for-revision
# ---------------------------------------------------------------------------


def test_covenant_projection_violation_return_for_revision() -> None:
    """covenant-projection-violation — projected seasonal Q3 DSCR trough breach triggers RETURN_FOR_REVISION (not DECLINE)."""
    fixture = _load_fixture("covenant_projection_violation")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    assert event_payload["borrower_id"] == "DEMO-RET-001"
    assert event_payload["loan_amount"] == 3_000_000

    trough_data = event_payload["trailing_quarter_data"]
    covenant_min = event_payload["proposed_covenant_minimum_dscr"]
    assert trough_data["q3_2025_trailing_dscr"] < covenant_min, (
        "Fixture must have Q3 trough DSCR below proposed minimum covenant"
    )

    drafter_stub = _load_llm_fixture("drafter_covenant_projection_violation")
    memo = drafter_stub["output_value"]
    assert memo["recommendation"] == "RETURN_FOR_REVISION", (
        "Decision must be RETURN_FOR_REVISION — covenant violation triggers revision path, not outright decline"
    )
    assert memo["risk_band"] in ("1-pass", "2-special-mention")
    assert len(memo.get("suggested_revisions", [])) >= 1
    assert memo["citation_density"] >= 0.8
    # Memo must not have been a plain decline
    assert memo["recommendation"] != "DECLINE"

    rater_stub = _load_llm_fixture("rater_covenant_projection_violation")
    rating = rater_stub["output_value"]
    assert rating["risk_band"] in ("1-pass", "2-special-mention")
    assert rating["covenant_violation_flag"] is True
    assert rating["covenant_violation_type"] == "projected_seasonal_trough"
    # Full-year DSCR is still strong
    assert rating["dscr_base"] >= 1.25

    extractor_stub = _load_llm_fixture("extractor_covenant_projection_violation")
    extracted = extractor_stub["output_value"]
    quarterly = extracted.get("quarterly_trailing_dscr", {})
    assert quarterly.get("Q3_2025", 99) < covenant_min, (
        "Extracted quarterly DSCR must show Q3 trough below covenant minimum"
    )

    expected = fixture["expected_outcome"]
    assert expected["status"] == "returned"

    pytest.skip(
        "TODO: wire to emulator — set PUBSUB_EMULATOR_HOST and remove this skip"
    )


@pytest.mark.live
def test_covenant_projection_violation_return_for_revision_live(
    oidc_token: str, live_endpoints: dict[str, str]
) -> None:
    """covenant-projection-violation against real GCP — covenant-analyzer seasonal projection must trigger revision path."""
    fixture = _load_fixture("covenant_projection_violation")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    resp = _submit_to_handler(event_payload, token=oidc_token, message_id=context_id)
    _assert_handler_response(resp, context_id)

    # TODO: poll workflow result endpoint once deployed
    # result = _poll_result(context_id, timeout_s=120)
    # assert result["recommendation"] == "RETURN_FOR_REVISION"
    # assert result["risk_band"] in ("1-pass", "2-special-mention")
    # assert result["covenant_analyzer"]["violations_projected"] is True
    # assert "Q3" in result["covenant_analyzer"]["violating_period"]
    # assert len(result.get("suggested_revisions", [])) >= 1
    pytest.skip("TODO: poll workflow result endpoint for live assertion")


# ---------------------------------------------------------------------------
# Scenario 5 — regulatory-clock-breach-alarm
# ---------------------------------------------------------------------------


def test_regulatory_clock_breach_alarm() -> None:
    """regulatory-clock-breach-alarm — event submitted with pipeline already stalled at 4d22h; P1 alarm must fire within 5 business days."""
    fixture = _load_fixture("regulatory_clock_breach")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    assert event_payload["borrower_id"] == "DEMO-HLT-002"
    assert event_payload["application_id"] == "DEMO-APP-HLT-002-2026"

    clock_sim = event_payload["clock_simulation"]
    assert clock_sim["decision_communicated"] is False
    assert clock_sim["business_days_elapsed"] >= 4.9, (
        "Clock simulation must be near the 5-business-day breach threshold"
    )
    assert clock_sim["inject_failure"]["failure_type"] == "timeout"
    assert clock_sim["inject_failure"]["retry_count"] == 3
    assert clock_sim["inject_failure"]["dlq_entry"] is True

    # Validate extractor stub reflects failure, not success
    extractor_stub = _load_llm_fixture("extractor_regulatory_clock_breach")
    ext_out = extractor_stub["output_value"]
    assert ext_out["status"] == "FAILED"
    assert ext_out["retries_exhausted"] is True
    assert ext_out["dlq_entry"]["step"] == "agent-extractor"
    assert ext_out["pipeline_status"] == "STALLED"
    assert ext_out["extracted_financials"] is None

    # Validate drafter stub reflects alarm, not memo
    drafter_stub = _load_llm_fixture("drafter_regulatory_clock_breach")
    drafter_out = drafter_stub["output_value"]
    assert drafter_out["status"] == "NOT_REACHED"
    alarm = drafter_out["alarm"]
    assert alarm["severity"] == "P1"
    assert alarm["type"] == "regulatory_clock.breach"
    assert alarm["elapsed_business_days"] >= 5
    assert alarm["application_id"] == "DEMO-APP-HLT-002-2026"

    expected = fixture["expected_outcome"]
    assert expected["status"] == "STALLED"
    assert expected["regulatory_clock_breach"] is True
    assert expected["alarm_severity"] == "P1"

    pytest.skip(
        "TODO: wire to emulator — set PUBSUB_EMULATOR_HOST and remove this skip"
    )


@pytest.mark.live
def test_regulatory_clock_breach_alarm_live(oidc_token: str, live_endpoints: dict[str, str]) -> None:
    """regulatory-clock-breach-alarm against real GCP — stalled pipeline at T+5 business days must produce P1 alarm and audit log entry."""
    fixture = _load_fixture("regulatory_clock_breach")
    context_id = fixture["context_id"]
    event_payload = fixture["event_payload"]

    resp = _submit_to_handler(event_payload, token=oidc_token, message_id=context_id)
    _assert_handler_response(resp, context_id)

    # TODO: poll workflow result endpoint once deployed
    # result = _poll_result(context_id, timeout_s=180)
    # assert result["pipeline_status"] == "STALLED"
    # assert result["regulatory_clock"]["breach"] is True
    # assert result["regulatory_clock"]["elapsed_business_days"] >= 5
    # assert result["alarm"]["severity"] == "P1"
    # assert result["alarm"]["type"] == "regulatory_clock.breach"
    # assert "regulatory_clock.breach" in result.get("audit_log_entries", [])
    pytest.skip("TODO: poll workflow result endpoint for live assertion")
