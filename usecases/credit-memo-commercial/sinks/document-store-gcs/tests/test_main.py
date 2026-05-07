"""
Unit tests for document-store-gcs sink.

All GCS and Cloud SQL calls are mocked — no GCP credentials required.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Ensure main.py is importable from the service root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (  # noqa: E402
    decode_pubsub_payload,
    process,
    validate_payload,
    write_audit_event,
    write_memo_to_gcs,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_INNER_PAYLOAD: dict[str, Any] = {
    "context_id": "ctx-doc-001",
    "borrower_id": "BRW-001",
    "agent_outcome": {
        "loan_amount": 1_000_000.0,
        "risk_rating": "2-special-mention",
        "decision": "approved",
        "borrower_name": "Acme Corp",
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


def _make_mock_gcs(bucket_name: str = "test-bucket") -> MagicMock:
    """Build a mock GCS client whose bucket().blob().upload_from_string() succeeds."""
    blob_mock = MagicMock()
    bucket_mock = MagicMock()
    bucket_mock.blob.return_value = blob_mock
    gcs = MagicMock()
    gcs.bucket.return_value = bucket_mock
    return gcs


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
    assert result["context_id"] == "ctx-doc-001"
    assert "agent_outcome" in result


# ---------------------------------------------------------------------------
# 2. decode_pubsub_payload — malformed base64
# ---------------------------------------------------------------------------

def test_decode_pubsub_malformed_base64() -> None:
    envelope = {"message": {"data": "###bad###"}}
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
# 5. process — happy path, GCS write called
# ---------------------------------------------------------------------------

def test_process_happy_path_gcs_called(mock_engine) -> None:
    gcs = _make_mock_gcs()
    envelope = _make_envelope(VALID_INNER_PAYLOAD)

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        result = process(envelope, bq=mock_engine, gcs=gcs)

    assert result["context_id"] == "ctx-doc-001"
    assert "gcs_uri" in result
    assert "written_at" in result
    assert "size_bytes" in result
    # bucket() called at least once
    assert gcs.bucket.call_count >= 1


# ---------------------------------------------------------------------------
# 6. process — memo object written to correct GCS path
# ---------------------------------------------------------------------------

def test_process_memo_gcs_path_correct(mock_engine) -> None:
    gcs = _make_mock_gcs()
    envelope = _make_envelope(VALID_INNER_PAYLOAD)

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        process(envelope, bq=mock_engine, gcs=gcs)

    bucket_instance = gcs.bucket.return_value
    blob_calls = [c[0][0] for c in bucket_instance.blob.call_args_list]
    memo_path = "credit-memo-commercial/BRW-001/ctx-doc-001/memo.json"
    assert memo_path in blob_calls


# ---------------------------------------------------------------------------
# 7. process — metadata object written to correct GCS path
# ---------------------------------------------------------------------------

def test_process_metadata_gcs_path_correct(mock_engine) -> None:
    gcs = _make_mock_gcs()
    envelope = _make_envelope(VALID_INNER_PAYLOAD)

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        process(envelope, bq=mock_engine, gcs=gcs)

    bucket_instance = gcs.bucket.return_value
    blob_calls = [c[0][0] for c in bucket_instance.blob.call_args_list]
    meta_path = "credit-memo-commercial/BRW-001/ctx-doc-001/metadata.json"
    assert meta_path in blob_calls


# ---------------------------------------------------------------------------
# 8. process — audit fired with context_id and success status
# ---------------------------------------------------------------------------

def test_process_audit_fired_on_success(mock_engine) -> None:
    gcs = _make_mock_gcs()
    envelope = _make_envelope(VALID_INNER_PAYLOAD)

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        process(envelope, bq=mock_engine, gcs=gcs)

    # begin() called for audit INSERT
    mock_engine.begin.assert_called()
    params = mock_engine.begin.return_value.execute.call_args[0][1]
    assert params["ctx"] == "ctx-doc-001"
    assert "success" in params["out"]


# ---------------------------------------------------------------------------
# 9. process — returns dict (HTTP 200) on validation error
# ---------------------------------------------------------------------------

def test_process_returns_dict_on_validation_error(mock_engine) -> None:
    gcs = _make_mock_gcs()
    bad_inner = {"context_id": "x", "borrower_id": "y"}  # missing agent_outcome
    envelope = _make_envelope(bad_inner)

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        result = process(envelope, bq=mock_engine, gcs=gcs)

    assert isinstance(result, dict)
    assert "error" in result


# ---------------------------------------------------------------------------
# 10. process — audit fires on error
# ---------------------------------------------------------------------------

def test_process_audit_fires_on_error(mock_engine) -> None:
    gcs = _make_mock_gcs()
    bad_inner = {"context_id": "ctx-err", "borrower_id": "BRW-err"}  # missing agent_outcome
    envelope = _make_envelope(bad_inner)

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        process(envelope, bq=mock_engine, gcs=gcs)

    # validation fails before context_id is extracted from payload, so ctx="unknown"
    assert mock_engine.begin.call_count >= 1
    last_params = mock_engine.begin.return_value.execute.call_args[0][1]
    assert "error" in last_params["out"]


# ---------------------------------------------------------------------------
# 11. process — missing GCS_MEMO_BUCKET env var causes error, returns dict
# ---------------------------------------------------------------------------

def test_process_missing_bucket_env_var(mock_engine) -> None:
    gcs = _make_mock_gcs()
    envelope = _make_envelope(VALID_INNER_PAYLOAD)

    env_without_bucket = {k: v for k, v in os.environ.items() if k != "GCS_MEMO_BUCKET"}
    env_without_bucket["GCS_MEMO_BUCKET"] = ""  # force empty

    with patch.dict(os.environ, env_without_bucket, clear=True):
        result = process(envelope, bq=mock_engine, gcs=gcs)

    assert isinstance(result, dict)
    assert "error" in result


# ---------------------------------------------------------------------------
# 12. process — empty pub/sub envelope returns dict (never raises)
# ---------------------------------------------------------------------------

def test_process_empty_envelope_returns_dict(mock_engine) -> None:
    gcs = _make_mock_gcs()

    with patch.dict(os.environ, {"GCS_MEMO_BUCKET": "test-bucket", "GCP_PROJECT": "test-proj"}):
        result = process({}, bq=mock_engine, gcs=gcs)

    assert isinstance(result, dict)
    assert "error" in result


# ---------------------------------------------------------------------------
# 13. write_memo_to_gcs — size_bytes reflects actual memo content
# ---------------------------------------------------------------------------

def test_write_memo_gcs_size_bytes_nonzero() -> None:
    gcs = _make_mock_gcs()
    agent_outcome = {"loan_amount": 500_000}
    gcs_uri, size_bytes = write_memo_to_gcs(gcs, "test-bucket", "ctx-sz", "BRW-sz", agent_outcome, "2026-05-07T00:00:00Z")
    assert size_bytes > 0
    assert "ctx-sz" in gcs_uri


# ---------------------------------------------------------------------------
# 14. write_audit_event — DB error is swallowed (not raised)
# ---------------------------------------------------------------------------

def test_write_audit_event_db_error_swallowed() -> None:
    bad_eng = MagicMock()
    bad_conn = MagicMock()
    bad_conn.__enter__ = lambda s: bad_conn
    bad_conn.__exit__ = MagicMock(return_value=False)
    bad_conn.execute.side_effect = Exception("db connection refused")
    bad_eng.begin.return_value = bad_conn
    # Should not raise
    write_audit_event(bad_eng, "test-proj", "ctx-sw", "BRW-sw", "gs://x/y", "success")
