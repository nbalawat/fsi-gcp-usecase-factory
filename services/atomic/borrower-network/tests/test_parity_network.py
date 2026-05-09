"""Parity tests: borrower-network ↔ legacy exposure-aggregator + insider-screening."""
from __future__ import annotations

import importlib.util
import json
import os
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


class FakeRequest:
    def __init__(self, *, method: str, path: str, json_body: dict | None = None) -> None:
        self.method = method
        self.path = path
        self._body = json_body

    def get_json(self, force: bool = False, silent: bool = False):  # noqa: ARG002
        return self._body


class TestExposureParity:
    def test_smoke_payload_byte_equal(self):
        legacy = _load("exposure-aggregator")
        new = _load("borrower-network")
        with (_ATOMIC / "exposure-aggregator" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)

        legacy_out = legacy.process(payload)
        new_out = new._exposure.process(payload)

        a = {k: v for k, v in legacy_out.items() if k != "_meta"}
        b = {k: v for k, v in new_out.items() if k != "_meta"}
        assert a == b


class TestInsiderParity:
    def test_smoke_payload_byte_equal(self):
        legacy = _load("insider-screening")
        new = _load("borrower-network")
        with (_ATOMIC / "insider-screening" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)

        legacy_out = legacy.process(payload)
        new_out = new._insider.process(payload)

        a = {k: v for k, v in legacy_out.items() if k != "_meta"}
        b = {k: v for k, v in new_out.items() if k != "_meta"}
        assert a == b


class TestRouting:
    def test_health(self):
        m = _load("borrower-network")
        body, status, _ = m.http(FakeRequest(method="GET", path="/health"))
        assert status == 200
        parsed = json.loads(body)
        assert parsed["service"] == "borrower-network"
        assert set(parsed["endpoints"]) == {"/exposure", "/insider_check"}

    def test_unknown_path_404(self):
        m = _load("borrower-network")
        _, status, _ = m.http(FakeRequest(method="GET", path="/nope"))
        assert status == 404
