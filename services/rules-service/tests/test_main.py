"""Unit tests for rules-service."""

from __future__ import annotations

import json
import os
import sys
import types
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Stub out bank.logging before importing main so the import doesn't fail
# in environments where the bank package is not installed.
# ---------------------------------------------------------------------------
_bank_pkg = types.ModuleType("bank")
_bank_logging = types.ModuleType("bank.logging")
import logging as _stdlib_logging  # noqa: E402

_bank_logging.redacting_logger = _stdlib_logging.getLogger  # type: ignore[attr-defined]
sys.modules.setdefault("bank", _bank_pkg)
sys.modules.setdefault("bank.logging", _bank_logging)

# Stub opentelemetry modules if not present
for _mod in (
    "opentelemetry",
    "opentelemetry.trace",
    "opentelemetry.sdk",
    "opentelemetry.sdk.trace",
):
    if _mod not in sys.modules:
        sys.modules[_mod] = types.ModuleType(_mod)

if "opentelemetry.trace" in sys.modules:
    _ot = sys.modules["opentelemetry.trace"]
    if not hasattr(_ot, "get_tracer"):
        _mock_span = MagicMock()
        _mock_span.__enter__ = lambda s: s
        _mock_span.__exit__ = MagicMock(return_value=False)
        _mock_tracer = MagicMock()
        _mock_tracer.start_as_current_span = MagicMock(return_value=_mock_span)
        _ot.get_tracer = MagicMock(return_value=_mock_tracer)  # type: ignore[attr-defined]

import opentelemetry.trace as _trace_mod  # noqa: E402

if not hasattr(_trace_mod, "get_tracer"):
    _mock_span2 = MagicMock()
    _mock_span2.__enter__ = lambda s: s
    _mock_span2.__exit__ = MagicMock(return_value=False)
    _mock_tracer2 = MagicMock()
    _mock_tracer2.start_as_current_span = MagicMock(return_value=_mock_span2)
    _trace_mod.get_tracer = MagicMock(return_value=_mock_tracer2)  # type: ignore[attr-defined]

# Point RULES_DIR at the repo-level rules/ directory so tests resolve real rule files.
_REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.environ.setdefault("RULES_DIR", os.path.join(_REPO_ROOT, "rules"))

# ---------------------------------------------------------------------------
# Now it is safe to import the service module.
# ---------------------------------------------------------------------------
import main  # noqa: E402  (rules-service/main.py)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

APPROVE_PAYLOAD: dict[str, Any] = {
    "context_id": "ctx-approve-01",
    "rule_set": "credit-memo-eligibility",
    "inputs": {
        "dscr_base": 1.35,
        "dscr_stressed": 1.15,
        "single_borrower_pct": 8.5,
        "borrower_id": "BRW-12345",
    },
}

DECLINE_PAYLOAD: dict[str, Any] = {
    "context_id": "ctx-decline-01",
    "rule_set": "credit-memo-eligibility",
    "inputs": {
        "dscr_base": 0.85,
        "dscr_stressed": 0.75,
        "single_borrower_pct": 8.5,
        "borrower_id": "BRW-99",
    },
}

REFER_PAYLOAD: dict[str, Any] = {
    "context_id": "ctx-refer-01",
    "rule_set": "credit-memo-eligibility",
    "inputs": {
        "dscr_base": 1.5,
        "dscr_stressed": 1.2,
        "single_borrower_pct": 16.0,
        "borrower_id": "BRW-55",
    },
}


def _mock_engine() -> MagicMock:
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
    eng = _mock_engine()
    monkeypatch.setattr("main._engine", eng)
    return eng


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_evaluate_approve(mock_engine) -> None:
    """Happy path: DSCR > 1.0 and concentration < 15 % → APPROVE."""
    result = main.process(APPROVE_PAYLOAD)
    assert result["decision"] == "APPROVE"
    assert result["context_id"] == "ctx-approve-01"
    assert result["rule_set"] == "credit-memo-eligibility"
    assert "evaluated_at" in result


def test_evaluate_decline(mock_engine) -> None:
    """DSCR base <= 1.0 → DECLINE."""
    result = main.process(DECLINE_PAYLOAD)
    assert result["decision"] == "DECLINE"
    assert result["reason"] != ""


def test_evaluate_refer(mock_engine) -> None:
    """Single borrower pct >= 15 → REFER."""
    result = main.process(REFER_PAYLOAD)
    assert result["decision"] == "REFER"
    assert "concentration" in result["reason"].lower()


def test_rule_set_not_found() -> None:
    """Non-existent rule_set file raises FileNotFoundError."""
    payload = {
        "context_id": "ctx-404",
        "rule_set": "does-not-exist-xyz",
        "inputs": {"foo": 1},
    }
    with pytest.raises(FileNotFoundError):
        main.process(payload)


def test_missing_context_id() -> None:
    """Missing context_id raises ValueError."""
    with pytest.raises(ValueError, match="context_id"):
        main.process({"rule_set": "credit-memo-eligibility", "inputs": {}})


def test_missing_rule_set() -> None:
    """Missing rule_set raises ValueError."""
    with pytest.raises(ValueError, match="rule_set"):
        main.process({"context_id": "ctx-x", "inputs": {}})


def test_missing_inputs() -> None:
    """Missing inputs raises ValueError."""
    with pytest.raises(ValueError, match="inputs"):
        main.process({"context_id": "ctx-x", "rule_set": "credit-memo-eligibility"})


def test_audit_write_called(mock_engine) -> None:
    """Successful evaluation writes one Cloud SQL audit row."""
    # Call via HTTP handler to exercise the finally block
    request = MagicMock()
    request.get_json.return_value = APPROVE_PAYLOAD

    main.main(request)

    # engine.begin() was called at least once for the audit INSERT
    mock_engine.begin.assert_called()


def test_audit_write_on_error(mock_engine) -> None:
    """Audit fires even when rule_set is not found (evaluation error path)."""
    request = MagicMock()
    request.get_json.return_value = {
        "context_id": "ctx-err",
        "rule_set": "no-such-rule",
        "inputs": {"x": 1},
    }

    body_bytes, status, _ = main.main(request)
    assert status == 404

    # engine.begin() called for audit even on error
    mock_engine.begin.assert_called()


def test_outputs_in_response(mock_engine) -> None:
    """Response body contains an 'outputs' dict."""
    result = main.process(APPROVE_PAYLOAD)
    assert "outputs" in result
    assert isinstance(result["outputs"], dict)


def test_http_400_on_missing_inputs(mock_engine) -> None:
    """HTTP handler returns 400 when required fields are absent."""
    request = MagicMock()
    request.get_json.return_value = {"context_id": "ctx-x"}  # rule_set + inputs missing

    _, status, _ = main.main(request)
    assert status == 400


def test_http_404_on_missing_rule_set(mock_engine) -> None:
    """HTTP handler returns 404 when rule file is missing."""
    request = MagicMock()
    request.get_json.return_value = {
        "context_id": "ctx-x",
        "rule_set": "nonexistent-rule",
        "inputs": {"a": 1},
    }

    body_bytes, status, _ = main.main(request)
    assert status == 404
    body = json.loads(body_bytes)
    assert body["error"] == "rule_set not found"


def test_evaluated_at_is_iso8601(mock_engine) -> None:
    """evaluated_at field is a valid ISO-8601 UTC timestamp string."""
    result = main.process(APPROVE_PAYLOAD)
    ts = result["evaluated_at"]
    assert ts.endswith("Z"), f"expected UTC 'Z' suffix, got: {ts}"
    # Basic sanity: parseable length
    assert len(ts) >= 20
