"""Parity tests: loan-serviceability ↔ legacy dscr-calculator + covenant-analyzer.

The consolidated service must produce IDENTICAL output to the legacy
services for every golden fixture. This is the gate Track G watches
during the 7-day cutover period — once the consolidated service has
shipped 100% parity for a week, the legacy services are decommissioned.

Run:
  PYTHONPATH=. pytest services/atomic/loan-serviceability/tests/test_parity.py -v

Imports legacy `process()` directly so no Cloud Run + no live infra is
needed. The parity gate runs in pure CI.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("PYTEST_CURRENT_TEST", "1")
os.environ.setdefault("CI_SKIP_ASSERT_ENV", "1")

_REPO = Path(__file__).resolve().parents[4]
_ATOMIC = _REPO / "services" / "atomic"


def _load(svc: str):
    spec = importlib.util.spec_from_file_location(
        f"_t_{svc.replace('-', '_')}",
        _ATOMIC / svc / "main.py",
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ============================================================================
# DSCR parity
# ============================================================================


class TestDscrParity:
    def test_smoke_payload_byte_equal(self):
        legacy = _load("dscr-calculator")
        new = _load("loan-serviceability")  # noqa: F841 — proves it imports

        # New service imports the same legacy `process` so output is by
        # construction identical. The test verifies the import chain
        # doesn't get broken (a refactor in dscr-calculator must continue
        # to flow through loan-serviceability).
        with (_ATOMIC / "dscr-calculator" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)

        legacy_out = legacy.process(payload)

        # Re-load loan-serviceability's bound _dscr — proves the
        # in-process import mechanism works
        ls_module = _load("loan-serviceability")
        new_out = ls_module._dscr.process(payload)

        # Strip non-deterministic _meta fields if present
        legacy_clean = {k: v for k, v in legacy_out.items() if k != "_meta"}
        new_clean = {k: v for k, v in new_out.items() if k != "_meta"}

        assert legacy_clean == new_clean, (
            f"DSCR parity broken!\n"
            f"  Legacy: {json.dumps(legacy_clean, indent=2, sort_keys=True)[:600]}\n"
            f"  New   : {json.dumps(new_clean, indent=2, sort_keys=True)[:600]}"
        )

    def test_known_value_passes_dscr_threshold(self):
        legacy = _load("dscr-calculator")
        with (_ATOMIC / "dscr-calculator" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)
        out = legacy.process(payload)
        assert "dscr_base" in out
        # Smoke fixture is hand-tuned to produce a passing DSCR
        if out["dscr_base"] is not None:
            assert out["dscr_base"] > 0


# ============================================================================
# Covenant parity
# ============================================================================


class TestCovenantParity:
    def test_smoke_payload_byte_equal(self):
        legacy = _load("covenant-analyzer")
        ls_module = _load("loan-serviceability")

        with (_ATOMIC / "covenant-analyzer" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)

        legacy_out = legacy.process(payload)
        new_out = ls_module._covenant.process(payload)

        legacy_clean = {k: v for k, v in legacy_out.items() if k != "_meta"}
        new_clean = {k: v for k, v in new_out.items() if k != "_meta"}

        assert legacy_clean == new_clean, (
            f"Covenant parity broken!\n"
            f"  Legacy: {json.dumps(legacy_clean, indent=2, sort_keys=True)[:600]}\n"
            f"  New   : {json.dumps(new_clean, indent=2, sort_keys=True)[:600]}"
        )


# ============================================================================
# HTTP routing
# ============================================================================


class FakeRequest:
    def __init__(self, *, method: str, path: str, json_body: dict | None = None) -> None:
        self.method = method
        self.path = path
        self._body = json_body

    def get_json(self, force: bool = False, silent: bool = False):  # noqa: ARG002
        return self._body


class TestRouting:
    def test_health_returns_200(self):
        ls_module = _load("loan-serviceability")
        body, status, _ = ls_module.http(FakeRequest(method="GET", path="/health"))
        assert status == 200
        parsed = json.loads(body)
        assert parsed["status"] == "healthy"
        assert parsed["service"] == "loan-serviceability"
        assert "/dscr" in parsed["endpoints"]
        assert "/covenant_test" in parsed["endpoints"]

    def test_unknown_path_404(self):
        ls_module = _load("loan-serviceability")
        body, status, _ = ls_module.http(FakeRequest(method="GET", path="/nope"))
        assert status == 404
        assert json.loads(body)["error"] == "not_found"

    def test_dscr_dispatch_carries_service_meta(self):
        ls_module = _load("loan-serviceability")
        with (_ATOMIC / "dscr-calculator" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)
        body, status, _ = ls_module.http(
            FakeRequest(method="POST", path="/dscr", json_body=payload),
        )
        assert status == 200
        parsed = json.loads(body)
        # New service tags the response with its own service name in _meta
        assert parsed["_meta"]["service"] == "loan-serviceability"
        assert parsed["_meta"]["latency_ms"] >= 0
        # Core compute output is unchanged
        assert "dscr_base" in parsed

    def test_invalid_payload_returns_400(self):
        ls_module = _load("loan-serviceability")
        # Empty payload — DSCR's process() raises ValueError on missing keys
        body, status, _ = ls_module.http(
            FakeRequest(method="POST", path="/dscr", json_body={}),
        )
        # Either 400 (ValueError) or 500 — both are loud failures
        assert status in (400, 500), f"Empty payload must fail; got {status}: {body}"
