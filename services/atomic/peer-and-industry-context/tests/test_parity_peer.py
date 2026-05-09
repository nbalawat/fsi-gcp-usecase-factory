"""Parity tests: peer-and-industry-context ↔ legacy peer-benchmarker + industry-risk-scorer."""
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


class TestPeerSetParity:
    def test_smoke_payload_byte_equal(self):
        legacy = _load("peer-benchmarker")
        new = _load("peer-and-industry-context")
        with (_ATOMIC / "peer-benchmarker" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)

        legacy_out = legacy.process(payload)
        new_out = new._peer.process(payload)

        a = {k: v for k, v in legacy_out.items() if k != "_meta"}
        b = {k: v for k, v in new_out.items() if k != "_meta"}
        assert a == b


class TestIndustryRiskParity:
    def test_smoke_payload_byte_equal(self):
        legacy = _load("industry-risk-scorer")
        new = _load("peer-and-industry-context")
        with (_ATOMIC / "industry-risk-scorer" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)

        legacy_out = legacy.process(payload)
        new_out = new._industry.process(payload)

        a = {k: v for k, v in legacy_out.items() if k != "_meta"}
        b = {k: v for k, v in new_out.items() if k != "_meta"}
        assert a == b


class TestRouting:
    def test_health(self):
        m = _load("peer-and-industry-context")
        body, status, _ = m.http(FakeRequest(method="GET", path="/health"))
        assert status == 200
        parsed = json.loads(body)
        assert parsed["service"] == "peer-and-industry-context"
        assert set(parsed["endpoints"]) == {"/peer_set", "/industry_risk"}

    def test_unknown_path_404(self):
        m = _load("peer-and-industry-context")
        _, status, _ = m.http(FakeRequest(method="GET", path="/nope"))
        assert status == 404

    def test_peer_set_dispatch(self):
        m = _load("peer-and-industry-context")
        with (_ATOMIC / "peer-benchmarker" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)
        body, status, _ = m.http(FakeRequest(method="POST", path="/peer_set", json_body=payload))
        assert status == 200
        parsed = json.loads(body)
        assert parsed["_meta"]["service"] == "peer-and-industry-context"

    def test_industry_risk_dispatch(self):
        m = _load("peer-and-industry-context")
        with (_ATOMIC / "industry-risk-scorer" / "tests" / "smoke_payload.json").open() as f:
            payload = json.load(f)
        body, status, _ = m.http(FakeRequest(method="POST", path="/industry_risk", json_body=payload))
        assert status == 200
        parsed = json.loads(body)
        assert parsed["_meta"]["service"] == "peer-and-industry-context"
