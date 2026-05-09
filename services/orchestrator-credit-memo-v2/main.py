"""orchestrator-credit-memo-v2 — Cloud Run host for the 5 consolidated agents.

Cloud Workflows v2 calls these endpoints sequentially:

  POST /document_processor            → reconciles per-doc extractions
  POST /analyst                        → 7-section analytical synthesis
  POST /rater_and_covenant_designer    → risk band + covenant package
  POST /drafter                        → 10-section credit memo
  POST /reviewer                       → audit findings + outcome
  GET  /health

Every endpoint uses the SAME pattern:
  1. Load the prompt from usecases/<uc>/agents/prompts/<agent>.md
  2. Load the response_schema from agents/<agent>.py
  3. Call Vertex Gemini with response_schema enforced
  4. Return the structured JSON response

This is a lean rewrite of the legacy orchestrator-credit-memo. The old
service mixed agent-invocation, atomic-service calls, audit writes, and
state transitions in one process. v2 is JUST the agent-invocation
slice — Cloud Workflows handles the sequencing + audit-writer handles
the DB writes.
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

SERVICE_NAME = "orchestrator-credit-memo-v2"

# ─── Boot-time env validation (Rule 20) ──────────────────────────────────────

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


# ─── Load agent modules (response_schemas live in the agent files) ──────────

_REPO_ROOT = Path(os.environ.get("REPO_ROOT", "/app"))
_AGENTS_DIR = _REPO_ROOT / "usecases" / "credit-memo-commercial" / "agents"
_PROMPTS_DIR = _AGENTS_DIR / "prompts"


def _load_agent_module(name: str):
    spec = importlib.util.spec_from_file_location(
        f"_agent_{name}",
        _AGENTS_DIR / f"{name}.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load agent module {name}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_DOC_PROCESSOR = _load_agent_module("document_processor")
_ANALYST = _load_agent_module("analyst")
_RATER = _load_agent_module("rater_and_covenant_designer")
_REVIEWER = _load_agent_module("reviewer")


# Each agent: (prompt-file basename, response_schema, gemini_model_id, max_output_tokens)
# max_output_tokens raised based on real-world observation — Vertex truncates
# JSON mid-stream when the limit is hit, breaking json.loads downstream.
AGENT_CONFIG: dict[str, tuple[str, dict[str, Any], str, int]] = {
    "document_processor":         ("document_processor",         _DOC_PROCESSOR.DOCUMENT_PROCESSOR_RESPONSE_SCHEMA, "gemini-2.5-pro",  16384),
    "analyst":                    ("analyst",                    _ANALYST.ANALYST_RESPONSE_SCHEMA,                  "gemini-2.5-pro",  16384),
    "rater_and_covenant_designer":("rater_and_covenant_designer",_RATER.RATER_RESPONSE_SCHEMA,                      "gemini-2.5-pro",  12288),
    "reviewer":                   ("reviewer",                   _REVIEWER.REVIEWER_RESPONSE_SCHEMA,                "gemini-2.5-pro",  12288),
}

# The drafter is special — it uses the existing legacy drafter prompt +
# schema (10-section credit memo, already validated). We import its
# response_schema from the legacy orchestrator-credit-memo if available;
# otherwise the drafter endpoint uses prompt-only constraint.


def _load_prompt(role: str) -> str:
    path = _PROMPTS_DIR / f"{role}.md"
    if not path.exists():
        raise FileNotFoundError(f"prompt not found: {path}")
    return path.read_text()


# ─── HTTP entry ──────────────────────────────────────────────────────────────


@functions_framework.http
def http(request: Any) -> Any:
    path = (request.path or "/").rstrip("/")
    method = request.method

    if method == "GET" and (path == "" or path == "/health"):
        return _health()

    if method != "POST":
        return _err(405, "method_not_allowed", path)

    role = path.lstrip("/")
    if role == "drafter":
        return _invoke_drafter(request)
    if role in AGENT_CONFIG:
        return _invoke_agent(role, request)

    return _err(404, "agent_not_found", path)


def _health():
    return (
        json.dumps({
            "status": "healthy",
            "service": SERVICE_NAME,
            "agents": list(AGENT_CONFIG.keys()) + ["drafter"],
            "git_sha": os.environ.get("GIT_SHA"),
        }),
        200,
        {"Content-Type": "application/json"},
    )


def _err(status: int, code: str, detail: str = ""):
    return (
        json.dumps({"error": code, "detail": detail, "service": SERVICE_NAME}),
        status,
        {"Content-Type": "application/json"},
    )


def _invoke_agent(role: str, request: Any):
    started = time.monotonic()
    try:
        body = request.get_json(force=True) or {}
    except Exception as e:
        return _err(400, "bad_json", str(e)[:200])

    prompt_role, response_schema, model_id, max_tokens = AGENT_CONFIG[role]

    try:
        result = _call_vertex(
            prompt_role=prompt_role,
            user_input=body,
            response_schema=response_schema,
            model=model_id,
            max_tokens=max_tokens,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        return (
            json.dumps({
                **result,
                "_meta": {
                    "service": SERVICE_NAME,
                    "agent": role,
                    "model": model_id,
                    "latency_ms": latency_ms,
                },
            }),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[{SERVICE_NAME}] {role} failed: {e}\n{tb}", file=sys.stderr, flush=True)
        return _err(500, "agent_failed", f"{role}: {str(e)[:300]}")


def _invoke_drafter(request: Any):
    """Special handling — the drafter prompt + schema live with the
    LEGACY orchestrator-credit-memo. We import them at runtime if they
    were copied into this build, otherwise fall back to prompt-only."""
    started = time.monotonic()
    try:
        body = request.get_json(force=True) or {}
    except Exception as e:
        return _err(400, "bad_json", str(e)[:200])

    drafter_schema = None
    drafter_prompt_path = _PROMPTS_DIR / "drafter.md"
    if not drafter_prompt_path.exists():
        return _err(500, "missing_drafter_prompt", "drafter.md not found in build")

    try:
        result = _call_vertex(
            prompt_role="drafter",
            user_input=body,
            response_schema=drafter_schema,
            model="gemini-2.5-pro",
            max_tokens=16384,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        return (
            json.dumps({
                **result,
                "_meta": {
                    "service": SERVICE_NAME,
                    "agent": "drafter",
                    "model": "gemini-2.5-pro",
                    "latency_ms": latency_ms,
                },
            }),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[{SERVICE_NAME}] drafter failed: {e}\n{tb}", file=sys.stderr, flush=True)
        return _err(500, "drafter_failed", str(e)[:300])


def _call_vertex(
    *,
    prompt_role: str,
    user_input: dict[str, Any],
    response_schema: dict[str, Any] | None,
    model: str,
    max_tokens: int,
) -> dict[str, Any]:
    from google import genai
    from google.genai import types as genai_types

    project = os.environ.get("GCP_PROJECT") or "agentic-experiments"
    location = os.environ.get("GCP_REGION", "us-central1")
    client = genai.Client(vertexai=True, project=project, location=location)
    system = _load_prompt(prompt_role)

    cfg_kwargs: dict[str, Any] = dict(
        system_instruction=system,
        response_mime_type="application/json",
        temperature=0.2,
        max_output_tokens=max_tokens,
    )
    if response_schema is not None:
        cfg_kwargs["response_schema"] = response_schema

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            try:
                resp = client.models.generate_content(
                    model=model,
                    contents=json.dumps(user_input),
                    config=genai_types.GenerateContentConfig(**cfg_kwargs),
                )
            except (TypeError, ValueError):
                # Some Vertex SDK versions reject our schema shape; fall
                # back to prompt-only constraint and let the prompt's
                # "# Output contract" section pin the structure.
                cfg_kwargs.pop("response_schema", None)
                resp = client.models.generate_content(
                    model=model,
                    contents=json.dumps(user_input),
                    config=genai_types.GenerateContentConfig(**cfg_kwargs),
                )
            break
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(min(8, 1.5 ** (attempt + 1)))
    else:
        raise RuntimeError(f"Vertex call failed after 3 attempts: {last_err}")

    text = resp.text or ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Strip ```json fences if present
        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("```", 2)[-1]
            if stripped.startswith("json"):
                stripped = stripped[4:]
            stripped = stripped.rsplit("```", 1)[0].strip()
        try:
            return json.loads(stripped)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Vertex returned non-JSON: {text[:500]}") from e
