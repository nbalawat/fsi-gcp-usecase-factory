"""Cloud Run entry point — atomic.peer-and-industry-context.

Consolidation of legacy peer-benchmarker + industry-risk-scorer (Track B).
Both share NAICS-driven lookups against shared peer-profile tables and
both produce contextual data for the rater. Merge avoids two cold starts
+ two threshold-table reads per case.

Endpoints (legacy-compatible):
  POST /peer_set       — peer benchmark cohort + percentiles (was peer-benchmarker)
  POST /industry_risk  — sector / industry risk scoring (was industry-risk-scorer)
  GET  /health
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import functions_framework

_ATOMIC_ROOT = Path(__file__).resolve().parent.parent


def _load_legacy(svc: str):
    spec = importlib.util.spec_from_file_location(
        f"_legacy_{svc.replace('-', '_')}",
        _ATOMIC_ROOT / svc / "main.py",
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_peer = _load_legacy("peer-benchmarker")
_industry = _load_legacy("industry-risk-scorer")


SERVICE_NAME = "peer-and-industry-context"
REQUIRED_ENV: list[str] = ["GCP_PROJECT"]


def _assert_env(required: list[str]) -> None:
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        raise SystemExit(
            f"FATAL: required env unset for {SERVICE_NAME}: {missing}."
        )


if (
    "PYTEST_CURRENT_TEST" not in os.environ
    and "CI_SKIP_ASSERT_ENV" not in os.environ
):
    _assert_env(REQUIRED_ENV)


@functions_framework.http
def http(request: Any) -> Any:
    path = (request.path or "/").rstrip("/")
    method = request.method

    if method == "GET" and (path == "" or path == "/health"):
        return (
            json.dumps(
                {
                    "status": "healthy",
                    "service": SERVICE_NAME,
                    "endpoints": ["/peer_set", "/industry_risk"],
                    "git_sha": os.environ.get("GIT_SHA"),
                }
            ),
            200,
            {"Content-Type": "application/json"},
        )

    if method == "POST" and path == "/peer_set":
        return _dispatch(_peer, request)

    if method == "POST" and path == "/industry_risk":
        return _dispatch(_industry, request)

    return (
        json.dumps({"error": "not_found", "path": request.path}),
        404,
        {"Content-Type": "application/json"},
    )


def _dispatch(legacy_module: Any, request: Any):
    started = time.monotonic()
    try:
        payload = request.get_json(force=True) or {}
        result = legacy_module.process(payload)
        latency_ms = int((time.monotonic() - started) * 1000)
        result.setdefault("_meta", {})["latency_ms"] = latency_ms
        result["_meta"]["service"] = SERVICE_NAME
        return (
            json.dumps(result),
            200,
            {"Content-Type": "application/json"},
        )
    except ValueError as e:
        return (
            json.dumps({"error": str(e), "service": SERVICE_NAME}),
            400,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(
            f"[{SERVICE_NAME}] unexpected: {e}\n{traceback.format_exc()}",
            file=sys.stderr,
            flush=True,
        )
        return (
            json.dumps(
                {"error": "internal_error", "service": SERVICE_NAME, "msg": str(e)[:500]}
            ),
            500,
            {"Content-Type": "application/json"},
        )
