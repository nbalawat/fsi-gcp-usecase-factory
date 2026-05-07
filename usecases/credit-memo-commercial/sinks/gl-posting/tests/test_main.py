"""
Unit tests for gl-posting sink.

All Cloud SQL calls are mocked — no GCP credentials required.
"""
from __future__ import annotations

import base64
import json
import sys
import os
from typing import Any
from unittest.mock import MagicMock, call, patch

import pytest

# Ensure main.py is importable from the service root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (  # noqa: E402
    decode_pubsub_payload,
    process,
    validate_payload,
    write_audit_event,
    write_gl_entry,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_INNER_PAYLOAD: dict[str, Any] = {
    "context_id": "ctx-001",
    "borrower_id": "BRW-001",
    "approver_decision": {
        "approver_id": "user-abc",
        "disposition": "approve",
        "approved_at": "2026-05-07T10:00:00Z",
    },
    "credit_memo": {
        "loan_amount": 1_000_000.0,
        "risk_rating": "2-special-mention",
    },
}


def _make_envelope(payload: dict[str, Any]) -> dict[str, Any]:
    """Wrap an inner payload dict in a Pub/Sub push envelope."""
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return {"message": {"data": encoded, "attributes": {}}}


def _make_mock_engine() -> MagicMock:
    """Return a SQLAlchemy engine mock whose connections succeed silently."""
    mock_conn = MagicMock()
    mock_conn.__enter__ = lambda s: mock_conn
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchall.return_value = []
    mock_eng = MagicMock()
    mock_eng.connect.return_value = mock_conn
    mock_eng.begin.return_value = mock_conn
    return mock_eng


@pytest.fixture(autouse=True)
def mock_engine(monkeypatch):
    eng = _make_mock_engine()
    monkeypatch.setattr("main._engine", eng)
    return eng


# ---------------------------------------------------------------------------
# 1. decode_pubsub_payload — happy path
# ---------------------------------------------------------------------------

def test_decode_pubsub_happy_path() -> None:
    envelope = _make_envelope(VALID_INNER_PAYLOAD)
    result = decode_pubsub_payload(envelope)
    assert result["context_id"] == "ctx-001"
    assert result["borrower_id"] == "BRW-001"


# ---------------------------------------------------------------------------
# 2. decode_pubsub_payload — malformed base64
# ---------------------------------------------------------------------------

def test_decode_pubsub_malformed_base64() -> None:
    envelope = {"message": {"data": "!!!not-valid-base64!!!"}}
    with pytest.raises(ValueError, match="malformed base64"):
        decode_pubsub_payload(envelope)


# ---------------------------------------------------------------------------
# 3. decode_pubsub_payload — missing data field
# ---------------------------------------------------------------------------

def test_decode_pubsub_missing_data() -> None:
    with pytest.raises(ValueError, match="missing 'data'"):
        decode_pubsub_payload({"message": {}})


# ---------------------------------------------------------------------------
# 4. validate_payload — missing required fields
# ---------------------------------------------------------------------------

def test_validate_payload_missing_fields() -> None:
    with pytest.raises(ValueError, match="missing required fields"):
        validate_payload({"context_id": "x"})


# ---------------------------------------------------------------------------
# 5. validate_payload — missing loan_amount in credit_memo
# ---------------------------------------------------------------------------

def test_validate_payload_no_loan_amount() -> None:
    bad_payload = {**VALID_INNER_PAYLOAD, "credit_memo": {"risk_rating": "1"}}
    with pytest.raises(ValueError, match="loan_amount"):
        validate_payload(bad_payload)


# ---------------------------------------------------------------------------
# 6. process — happy path, DB engine used
# ---------------------------------------------------------------------------

def test_process_happy_path_engine_called(mock_engine) -> None:
    envelope = _make_envelope(VALID_INNER_PAYLOAD)
    result = process(envelope, engine=mock_engine)

    assert result["context_id"] == "ctx-001"
    assert "gl_entry_id" in result
    assert "posted_at" in result
    # begin() called at least twice: GL write + audit write
    assert mock_engine.begin.call_count >= 2


# ---------------------------------------------------------------------------
# 7. process — GL write executes correct SQL
# ---------------------------------------------------------------------------

def test_process_gl_write_executes_sql(mock_engine) -> None:
    mock_conn = mock_engine.begin.return_value
    envelope = _make_envelope(VALID_INNER_PAYLOAD)
    process(envelope, engine=mock_engine)

    # execute was called at least once (for GL INSERT)
    assert mock_conn.execute.call_count >= 1
    first_call = mock_conn.execute.call_args_list[0]
    params = first_call[0][1]
    assert params["ctx"] == "ctx-001"
    assert params["amount"] == 1_000_000.0


# ---------------------------------------------------------------------------
# 8. process — audit write has context_id
# ---------------------------------------------------------------------------

def test_process_audit_has_context_id(mock_engine) -> None:
    mock_conn = mock_engine.begin.return_value
    envelope = _make_envelope(VALID_INNER_PAYLOAD)
    process(envelope, engine=mock_engine)

    # Second execute call is the audit INSERT
    audit_call = mock_conn.execute.call_args_list[1]
    params = audit_call[0][1]
    assert params["ctx"] == "ctx-001"
    assert "success" in params["out"]


# ---------------------------------------------------------------------------
# 9. process — returns HTTP 200 even on validation error (no loan_amount)
# ---------------------------------------------------------------------------

def test_process_returns_dict_on_validation_error(mock_engine) -> None:
    bad_inner = {**VALID_INNER_PAYLOAD, "credit_memo": {"no_amount": True}}
    envelope = _make_envelope(bad_inner)
    result = process(envelope, engine=mock_engine)
    # process must return a dict (caller returns 200)
    assert isinstance(result, dict)
    assert "error" in result


# ---------------------------------------------------------------------------
# 10. process — audit fires even on error
# ---------------------------------------------------------------------------

def test_process_audit_fires_on_error(mock_engine) -> None:
    bad_inner = {**VALID_INNER_PAYLOAD, "credit_memo": {}}
    envelope = _make_envelope(bad_inner)
    process(envelope, engine=mock_engine)
    # begin() called at least once for audit on error path
    assert mock_engine.begin.call_count >= 1
    last_params = mock_engine.begin.return_value.execute.call_args_list[-1][0][1]
    assert "error" in last_params["out"]


# ---------------------------------------------------------------------------
# 11. process — empty payload envelope returns dict (not exception)
# ---------------------------------------------------------------------------

def test_process_empty_envelope_returns_dict(mock_engine) -> None:
    result = process({}, engine=mock_engine)
    assert isinstance(result, dict)
    assert "error" in result


# ---------------------------------------------------------------------------
# 12. write_gl_entry — passes correct params
# ---------------------------------------------------------------------------

def test_write_gl_entry_correct_params(mock_engine) -> None:
    with patch.dict(os.environ, {"GCP_PROJECT": "test-proj", "GL_ACCOUNT_DEFAULT": "99999-TEST"}):
        write_gl_entry(mock_engine, "test-proj", "ctx-x", "BRW-x", 500_000.0, "approver-1", "2026-05-07T10:00:00Z", "entry-uuid")

    mock_engine.begin.assert_called_once()
    params = mock_engine.begin.return_value.execute.call_args[0][1]
    assert params["ctx"] == "ctx-x"
    assert params["amount"] == 500_000.0
    assert params["account"] == "99999-TEST"


# ---------------------------------------------------------------------------
# 13. write_audit_event — DB error is swallowed (logged only)
# ---------------------------------------------------------------------------

def test_write_audit_event_db_error_swallowed() -> None:
    bad_eng = MagicMock()
    bad_conn = MagicMock()
    bad_conn.__enter__ = lambda s: bad_conn
    bad_conn.__exit__ = MagicMock(return_value=False)
    bad_conn.execute.side_effect = Exception("db connection refused")
    bad_eng.begin.return_value = bad_conn
    # Should not raise
    write_audit_event(bad_eng, "test-proj", "ctx-err", "BRW-err", "entry-err", "success")
