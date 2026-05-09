"""Cloud Run entry point — atomic.loan-serviceability.

Consolidation of legacy dscr-calculator + covenant-analyzer (Track B,
8→5). The two services merge cleanly because:

  - Both consume the spread financial statements as primary input.
  - Both produce loan-serviceability metrics (DSCR + covenant tests).
  - Both share the same Cloud SQL connection pool + threshold table.

Endpoints (legacy-compatible — old payloads work unchanged):
  POST /dscr           — DSCR calculator (was atomic.dscr-calculator)
  POST /covenant_test  — covenant analyzer (was atomic.covenant-analyzer)
  GET  /health         — readiness probe

Behavior is BYTE-EQUIVALENT to the old services because we import the
legacy `process(payload)` functions verbatim. The parity test asserts
this against golden fixtures. Once Track G's cutover passes its 7-day
parity period, the old services are decommissioned.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import functions_framework

# Make the legacy services importable. The two services live as siblings
# under services/atomic/, so we add the parent directory to sys.path.
_ATOMIC_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ATOMIC_ROOT / "dscr-calculator"))
sys.path.insert(0, str(_ATOMIC_ROOT / "covenant-analyzer"))

# IMPORTANT: import the modules as namespaced aliases so the two
# legacy `process()` functions don't collide.
import importlib.util


def _load_legacy(svc: str):
    spec = importlib.util.spec_from_file_location(
        f"_legacy_{svc.replace('-', '_')}",
        _ATOMIC_ROOT / svc / "main.py",
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_dscr = _load_legacy("dscr-calculator")
_covenant = _load_legacy("covenant-analyzer")


SERVICE_NAME = "loan-serviceability"
REQUIRED_ENV: list[str] = ["GCP_PROJECT"]


def _assert_env(required: list[str]) -> None:
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        raise SystemExit(
            f"FATAL: required env unset for {SERVICE_NAME}: {missing}. "
            f"Set via gcloud run deploy --set-env-vars / --set-secrets."
        )


# Boot-time env validation (Rule 20). Skipped under pytest.
if (
    "PYTEST_CURRENT_TEST" not in os.environ
    and "CI_SKIP_ASSERT_ENV" not in os.environ
):
    _assert_env(REQUIRED_ENV)


@functions_framework.http
def http(request: Any) -> Any:
    """Single dispatching entry. Routes by request.path."""
    path = (request.path or "/").rstrip("/")
    method = request.method

    if method == "GET" and (path == "" or path == "/health"):
        return _handle_health()

    if method == "POST" and path == "/dscr":
        return _dispatch(_dscr, request)

    if method == "POST" and path == "/covenant_test":
        return _dispatch(_covenant, request)

    return (
        json.dumps({"error": "not_found", "path": request.path, "method": method}),
        404,
        {"Content-Type": "application/json"},
    )


def _handle_health() -> tuple[str, int, dict[str, str]]:
    return (
        json.dumps(
            {
                "status": "healthy",
                "service": SERVICE_NAME,
                "endpoints": ["/dscr", "/covenant_test"],
                "git_sha": os.environ.get("GIT_SHA"),
            }
        ),
        200,
        {"Content-Type": "application/json"},
    )


def _dispatch(legacy_module: Any, request: Any) -> tuple[str, int, dict[str, str]]:
    """Forward the request to the legacy service's process() function.
    Errors mirror the legacy contract (400 for ValueError, 500 otherwise)
    so consumers don't need to change.
    """
    started = time.monotonic()
    payload: dict[str, Any] = {}
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
        # Loud error path (Rule 3 — no silent stubs)
        print(
            f"[{SERVICE_NAME}] unexpected: {e}\n{traceback.format_exc()}",
            file=sys.stderr,
            flush=True,
        )
        return (
            json.dumps(
                {
                    "error": "internal_error",
                    "service": SERVICE_NAME,
                    "msg": str(e)[:500],
                }
            ),
            500,
            {"Content-Type": "application/json"},
        )
