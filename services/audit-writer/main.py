"""audit-writer — small Cloud Run service that brokers DB writes for
Cloud Workflows.

Cloud Workflows can call HTTP services and publish to Pub/Sub but cannot
execute SQL directly. This service exposes three thin endpoints that the
v2 workflow uses to update Cloud SQL:

  POST /event     — append a row to application_events
  POST /artifact  — append a row to application_artifacts
  POST /state     — UPDATE specific columns of application_state

Pydantic at every boundary; loud errors; OIDC auth (Cloud Workflows
sends a Google-issued ID token).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import functions_framework
import sqlalchemy
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import text


SERVICE_NAME = "audit-writer"
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


# ── Pydantic boundary ───────────────────────────────────────────────────────


class EventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    application_id: str = Field(..., min_length=36, max_length=36)
    event_type: str = Field(..., max_length=50)
    service_name: str | None = Field(default=None, max_length=100)
    payload: dict[str, Any]
    latency_ms: int | None = None
    cost_usd: float | None = None


class ArtifactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    application_id: str = Field(..., min_length=36, max_length=36)
    artifact_type: str = Field(..., max_length=40)
    revision_number: int = Field(default=1, ge=1)
    author: str = Field(..., max_length=40)
    body: dict[str, Any]


class StateUpdateRequest(BaseModel):
    """Selective column update — only the fields you provide are written.
    Used by the workflow to bump current_stage, decision, and risk_band
    without overwriting upstream-set fields."""

    model_config = ConfigDict(extra="forbid")

    application_id: str = Field(..., min_length=36, max_length=36)
    current_stage: str | None = Field(default=None, max_length=40)
    decision: str | None = Field(default=None, max_length=40)
    risk_band: str | None = Field(default=None, max_length=40)
    dscr_base: float | None = None
    dscr_stressed: float | None = None
    leverage_base: float | None = None
    single_borrower_pct: float | None = None
    agent_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    citation_density: float | None = Field(default=None, ge=0.0, le=1.0)


# Resolve forward refs (needed because of `from __future__ import annotations`)
EventRequest.model_rebuild()
ArtifactRequest.model_rebuild()
StateUpdateRequest.model_rebuild()


# ── DB engine ───────────────────────────────────────────────────────────────


_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
    global _engine
    if _engine is not None:
        return _engine

    url = os.environ.get("DATABASE_URL")
    if url:
        _engine = sqlalchemy.create_engine(url, pool_pre_ping=True, future=True)
        return _engine

    user = os.environ.get("DB_USER", "fsi_app")
    password = os.environ.get("DB_PASS", "")
    name = os.environ.get("DB_NAME", "fsi_banking")

    # On Cloud Run, INSTANCE_CONNECTION_NAME triggers the Cloud SQL
    # Connector path — no VPC connector required, IAM-routed.
    if os.environ.get("INSTANCE_CONNECTION_NAME"):
        from google.cloud.sql.connector import Connector
        connector = Connector()

        def getconn():
            return connector.connect(
                os.environ["INSTANCE_CONNECTION_NAME"],
                "pg8000",
                user=user,
                password=password,
                db=name,
                ip_type=os.environ.get("DB_IP_TYPE", "PRIVATE"),
            )
        _engine = sqlalchemy.create_engine(
            "postgresql+pg8000://", creator=getconn, pool_pre_ping=True, future=True,
        )
        return _engine

    from urllib.parse import quote_plus
    pw = quote_plus(password)
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    _engine = sqlalchemy.create_engine(
        f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}",
        pool_pre_ping=True,
        future=True,
    )
    return _engine


# ── Route handlers ──────────────────────────────────────────────────────────


@functions_framework.http
def http(request: Any) -> Any:
    path = (request.path or "/").rstrip("/")
    method = request.method

    if method == "GET" and (path == "" or path == "/health"):
        return (
            json.dumps({"status": "healthy", "service": SERVICE_NAME}),
            200,
            {"Content-Type": "application/json"},
        )

    if method == "POST" and path == "/event":
        return _handle_event(request)
    if method == "POST" and path == "/artifact":
        return _handle_artifact(request)
    if method == "POST" and path == "/state":
        return _handle_state(request)
    if method == "POST" and path == "/callback":
        return _handle_callback_register(request)
    if method == "POST" and path == "/callback/clear":
        return _handle_callback_clear(request)
    if method == "POST" and path == "/extraction_fixes":
        return _handle_extraction_fixes(request)

    return (
        json.dumps({"error": "not_found", "path": path}),
        404,
        {"Content-Type": "application/json"},
    )


# ── Callback registration / clearing (workflow → DB) ───────────────────────


class CallbackRegisterRequest(BaseModel):
    """Stores a workflow-issued callback URL on application_state.pending_callbacks
    so the UI can fetch it and POST to it when the human acts."""
    model_config = ConfigDict(extra="forbid")
    application_id: str = Field(..., min_length=36, max_length=36)
    checkpoint: str = Field(..., max_length=40)
    callback_url: str
    current_stage: str | None = Field(default=None, max_length=40)


class CallbackClearRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str = Field(..., min_length=36, max_length=36)
    checkpoint: str = Field(..., max_length=40)


CallbackRegisterRequest.model_rebuild()
CallbackClearRequest.model_rebuild()


def _handle_callback_register(request):
    try:
        body = request.get_json(force=True) or {}
        req = CallbackRegisterRequest.model_validate(body)
    except ValidationError as e:
        return (
            json.dumps({"error": "invalid_request", "details": e.errors()}),
            422,
            {"Content-Type": "application/json"},
        )

    # pg8000 can't bind a parameter through nested CAST(... AS jsonb); build
    # the full {checkpoint: payload} jsonb merge object in Python and pass it
    # as a single string parameter we cast once.
    callback_payload = {
        "url": req.callback_url,
        "registered_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    merge_obj_json = json.dumps({req.checkpoint: callback_payload})
    sql = text(
        """
        UPDATE application_state
           SET pending_callbacks = COALESCE(pending_callbacks, CAST('{}' AS jsonb))
                                  || CAST(:merge AS jsonb),
               current_stage = COALESCE(:stage, current_stage),
               updated_at = NOW(),
               last_event_at = NOW()
         WHERE application_id = :app_id
        """
    )
    try:
        with _get_engine().begin() as c:
            res = c.execute(sql, {
                "app_id": req.application_id,
                "merge": merge_obj_json,
                "stage": req.current_stage,
            })
            if res.rowcount == 0:
                return (
                    json.dumps({"error": "not_found", "application_id": req.application_id}),
                    404,
                    {"Content-Type": "application/json"},
                )
        return (
            json.dumps({"ok": True, "checkpoint": req.checkpoint}),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(f"[{SERVICE_NAME}] callback_register failed: {e}", file=sys.stderr, flush=True)
        return (
            json.dumps({"error": "write_failed", "msg": str(e)[:500]}),
            500,
            {"Content-Type": "application/json"},
        )


def _handle_callback_clear(request):
    try:
        body = request.get_json(force=True) or {}
        req = CallbackClearRequest.model_validate(body)
    except ValidationError as e:
        return (
            json.dumps({"error": "invalid_request", "details": e.errors()}),
            422,
            {"Content-Type": "application/json"},
        )

    sql = text(
        """
        UPDATE application_state
           SET pending_callbacks = COALESCE(pending_callbacks, CAST('{}' AS jsonb)) - :checkpoint,
               updated_at = NOW(),
               last_event_at = NOW()
         WHERE application_id = :app_id
        """
    )
    try:
        with _get_engine().begin() as c:
            c.execute(sql, {"app_id": req.application_id, "checkpoint": req.checkpoint})
        return (
            json.dumps({"ok": True}),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(f"[{SERVICE_NAME}] callback_clear failed: {e}", file=sys.stderr, flush=True)
        return (
            json.dumps({"error": "write_failed", "msg": str(e)[:500]}),
            500,
            {"Content-Type": "application/json"},
        )


# ── Extraction fix-ups (HITL feedback) ─────────────────────────────────────


class ExtractionFix(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str = Field(..., min_length=36, max_length=36)
    field_path: str = Field(..., max_length=200)
    new_value: Any | None = None


class ExtractionFixesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str = Field(..., min_length=36, max_length=36)
    fixes: list[ExtractionFix]


ExtractionFix.model_rebuild()
ExtractionFixesRequest.model_rebuild()


def _set_dotted(d: dict, path: str, value: Any) -> dict:
    """Set a dotted-path key in a nested dict, creating sub-objects as needed."""
    parts = path.split(".")
    cur = d
    for p in parts[:-1]:
        if not isinstance(cur.get(p), dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value
    return d


def _handle_extraction_fixes(request):
    """Apply per-field overrides to the latest document_extracted event for
    each (application_id, doc_id). Returns the patched documents list so
    the workflow can use it directly without re-querying."""
    try:
        body = request.get_json(force=True) or {}
        req = ExtractionFixesRequest.model_validate(body)
    except ValidationError as e:
        return (
            json.dumps({"error": "invalid_request", "details": e.errors()}),
            422,
            {"Content-Type": "application/json"},
        )

    try:
        engine = _get_engine()

        # Group fixes by doc_id
        by_doc: dict[str, list[ExtractionFix]] = {}
        for f in req.fixes:
            by_doc.setdefault(f.doc_id, []).append(f)

        with engine.begin() as c:
            patched_docs: list[dict] = []
            for doc_id, fixes in by_doc.items():
                # Find the most recent document_extracted event for this app+doc
                row = c.execute(
                    text(
                        "SELECT id, payload FROM application_events "
                        "WHERE application_id = :a "
                        "  AND event_type = 'document_extracted' "
                        "  AND payload->>'doc_id' = :d "
                        "ORDER BY occurred_at DESC LIMIT 1"
                    ),
                    {"a": req.application_id, "d": doc_id},
                ).first()
                if not row:
                    continue
                event_id, payload = row
                ext = payload.get("extracted_fields") or {}
                for f in fixes:
                    _set_dotted(ext, f.field_path, f.new_value)
                payload["extracted_fields"] = ext
                payload.setdefault("_human_overrides", []).extend(
                    [{"field_path": f.field_path, "new_value": f.new_value} for f in fixes]
                )

                # Insert a new event recording the override
                c.execute(
                    text(
                        "INSERT INTO application_events (application_id, event_type, "
                        "service_name, payload) VALUES (:a, 'extraction_override', "
                        "'underwriter', CAST(:p AS jsonb))"
                    ),
                    {"a": req.application_id, "p": json.dumps({
                        "doc_id": doc_id,
                        "fixes": [{"field_path": f.field_path, "new_value": f.new_value} for f in fixes],
                    })},
                )
                patched_docs.append(payload)

        return (
            json.dumps({"ok": True, "documents": patched_docs, "fixed_doc_count": len(patched_docs)}),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(f"[{SERVICE_NAME}] extraction_fixes failed: {e}", file=sys.stderr, flush=True)
        return (
            json.dumps({"error": "write_failed", "msg": str(e)[:500]}),
            500,
            {"Content-Type": "application/json"},
        )


def _handle_event(request: Any):
    try:
        body = request.get_json(force=True) or {}
        req = EventRequest.model_validate(body)
    except ValidationError as e:
        return (
            json.dumps({"error": "invalid_request", "details": e.errors()}),
            422,
            {"Content-Type": "application/json"},
        )

    sql = text(
        """
        INSERT INTO application_events
          (application_id, event_type, service_name, payload, latency_ms, cost_usd)
        VALUES
          (:application_id, :event_type, :service_name, CAST(:payload AS jsonb),
           :latency_ms, :cost_usd)
        RETURNING id
        """
    )
    try:
        with _get_engine().begin() as c:
            row_id = c.execute(
                sql,
                {
                    "application_id": req.application_id,
                    "event_type": req.event_type,
                    "service_name": req.service_name,
                    "payload": json.dumps(req.payload),
                    "latency_ms": req.latency_ms,
                    "cost_usd": req.cost_usd,
                },
            ).scalar()
        return (
            json.dumps({"ok": True, "event_id": row_id}),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(f"[{SERVICE_NAME}] event write failed: {e}", file=sys.stderr, flush=True)
        return (
            json.dumps({"error": "write_failed", "msg": str(e)[:500]}),
            500,
            {"Content-Type": "application/json"},
        )


def _handle_artifact(request: Any):
    try:
        body = request.get_json(force=True) or {}
        req = ArtifactRequest.model_validate(body)
    except ValidationError as e:
        return (
            json.dumps({"error": "invalid_request", "details": e.errors()}),
            422,
            {"Content-Type": "application/json"},
        )

    sql = text(
        """
        INSERT INTO application_artifacts
          (application_id, artifact_type, revision_number, author, body)
        VALUES
          (:application_id, :artifact_type, :revision_number, :author, CAST(:body AS jsonb))
        ON CONFLICT (application_id, artifact_type, revision_number) DO UPDATE
          SET body = EXCLUDED.body
        RETURNING id
        """
    )
    try:
        with _get_engine().begin() as c:
            row_id = c.execute(
                sql,
                {
                    "application_id": req.application_id,
                    "artifact_type": req.artifact_type,
                    "revision_number": req.revision_number,
                    "author": req.author,
                    "body": json.dumps(req.body),
                },
            ).scalar()
        return (
            json.dumps({"ok": True, "artifact_id": row_id}),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(f"[{SERVICE_NAME}] artifact write failed: {e}", file=sys.stderr, flush=True)
        return (
            json.dumps({"error": "write_failed", "msg": str(e)[:500]}),
            500,
            {"Content-Type": "application/json"},
        )


def _handle_state(request: Any):
    try:
        body = request.get_json(force=True) or {}
        req = StateUpdateRequest.model_validate(body)
    except ValidationError as e:
        return (
            json.dumps({"error": "invalid_request", "details": e.errors()}),
            422,
            {"Content-Type": "application/json"},
        )

    # Build a dynamic SET clause from the fields the caller actually
    # provided; never overwrite columns the caller didn't mention.
    updates = req.model_dump(exclude_none=True, exclude={"application_id"})
    if not updates:
        return (
            json.dumps({"error": "no_fields_to_update"}),
            400,
            {"Content-Type": "application/json"},
        )

    set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
    sql = text(
        f"""
        UPDATE application_state
           SET {set_clause}, updated_at = NOW(), last_event_at = NOW()
         WHERE application_id = :application_id
        """
    )
    try:
        with _get_engine().begin() as c:
            res = c.execute(sql, {**updates, "application_id": req.application_id})
            if res.rowcount == 0:
                return (
                    json.dumps(
                        {"error": "not_found", "application_id": req.application_id}
                    ),
                    404,
                    {"Content-Type": "application/json"},
                )
        return (
            json.dumps({"ok": True, "updated_columns": list(updates.keys())}),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as e:
        print(f"[{SERVICE_NAME}] state update failed: {e}", file=sys.stderr, flush=True)
        return (
            json.dumps({"error": "write_failed", "msg": str(e)[:500]}),
            500,
            {"Content-Type": "application/json"},
        )
