"""Cloud Run entry point — atomic.borrower-network.

Consolidation of legacy exposure-aggregator + insider-screening (Track B).
Both walk the bank's borrower-master + related-interests graph and share
reference tables. Merge cuts two cold starts + two graph traversals.

Endpoints (legacy-compatible):
  POST /exposure       — exposure aggregator (was exposure-aggregator)
  POST /insider_check  — Reg O insider screening (was insider-screening)
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


_exposure = _load_legacy("exposure-aggregator")
_insider = _load_legacy("insider-screening")


SERVICE_NAME = "borrower-network"
REQUIRED_ENV: list[str] = ["GCP_PROJECT"]


if (
    "PYTEST_CURRENT_TEST" not in os.environ
    and "CI_SKIP_ASSERT_ENV" not in os.environ
):
    missing = [v for v in REQUIRED_ENV if not os.environ.get(v)]
    if missing:
        raise SystemExit(
            f"FATAL: required env unset for {SERVICE_NAME}: {missing}."
        )


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
                    "endpoints": ["/exposure", "/insider_check"],
                    "git_sha": os.environ.get("GIT_SHA"),
                }
            ),
            200,
            {"Content-Type": "application/json"},
        )

    if method == "POST" and path == "/exposure":
        return _dispatch(_exposure, request)

    if method == "POST" and path == "/insider_check":
        return _dispatch(_insider, request)

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
