"""
document-store-gcs: receive approved credit memo via Pub/Sub and write memo JSON to GCS.

Step-5 sink — stateless, no business rules.
Accepts Pub/Sub push format. Writes memo + metadata objects to GCS and audit row to Cloud SQL.
Returns HTTP 200 always (Pub/Sub ack convention).
"""
from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from typing import Any

import functions_framework
import sqlalchemy
from google.cloud import storage
from opentelemetry import trace
from sqlalchemy import text

from bank.logging import redacting_logger

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)

SERVICE_NAME = "document-store-gcs"

_engine: sqlalchemy.Engine | None = None
_gcs_client: storage.Client | None = None


def _get_engine() -> sqlalchemy.Engine:
    global _engine
    if _engine is None:
        database_url = os.environ.get("DATABASE_URL")
        if database_url:
            _engine = sqlalchemy.create_engine(database_url, pool_size=2, max_overflow=0)
        else:
            from google.cloud.sql.connector import Connector
            connector = Connector()

            def getconn():
                return connector.connect(
                    os.environ["INSTANCE_CONNECTION_NAME"],
                    "pg8000",
                    user=os.environ["DB_USER"],
                    password=os.environ["DB_PASS"],
                    db=os.environ.get("DB_NAME", "fsi_banking"),
                )

            _engine = sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn, pool_size=2, max_overflow=0)
    return _engine


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def _get_project() -> str:
    return os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "local-dev"))


def _get_bucket_name() -> str:
    name = os.environ.get("GCS_MEMO_BUCKET", "agentic-experiments-credit-memo-docs")
    if not name:
        raise ValueError("GCS_MEMO_BUCKET environment variable must not be empty")
    return name


def decode_pubsub_payload(envelope: dict[str, Any]) -> dict[str, Any]:
    """Decode a Pub/Sub push envelope and return the inner JSON payload."""
    message = envelope.get("message", {})
    data_b64 = message.get("data", "")
    if not data_b64:
        raise ValueError("pubsub message missing 'data' field")
    try:
        decoded_bytes = base64.b64decode(data_b64)
    except Exception as exc:
        raise ValueError(f"malformed base64 in message.data: {exc}") from exc
    try:
        return json.loads(decoded_bytes)
    except json.JSONDecodeError as exc:
        raise ValueError(f"message.data is not valid JSON: {exc}") from exc


def validate_payload(payload: dict[str, Any]) -> None:
    """Raise ValueError if required fields are absent."""
    required = ["context_id", "borrower_id", "agent_outcome"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValueError(f"missing required fields: {missing}")
    if not isinstance(payload["agent_outcome"], dict):
        raise ValueError("agent_outcome must be an object")


def write_memo_to_gcs(
    gcs: storage.Client,
    bucket_name: str,
    context_id: str,
    borrower_id: str,
    agent_outcome: dict[str, Any],
    written_at: str,
) -> tuple[str, int]:
    """Write memo JSON and metadata JSON to GCS. Returns (gcs_uri, size_bytes)."""
    bucket = gcs.bucket(bucket_name)

    memo_blob_name = f"credit-memo-commercial/{borrower_id}/{context_id}/memo.json"
    memo_content = json.dumps(agent_outcome, indent=2).encode("utf-8")
    size_bytes = len(memo_content)

    memo_blob = bucket.blob(memo_blob_name)
    memo_blob.upload_from_string(memo_content, content_type="application/json")

    metadata_blob_name = f"credit-memo-commercial/{borrower_id}/{context_id}/metadata.json"
    metadata = {
        "context_id": context_id,
        "borrower_id": borrower_id,
        "written_at": written_at,
        "size_bytes": size_bytes,
    }
    metadata_blob = bucket.blob(metadata_blob_name)
    metadata_blob.upload_from_string(
        json.dumps(metadata, indent=2).encode("utf-8"),
        content_type="application/json",
    )

    gcs_uri = f"gs://{bucket_name}/{memo_blob_name}"
    return gcs_uri, size_bytes


def write_audit_event(
    engine: sqlalchemy.Engine,
    project: str,
    context_id: str,
    borrower_id: str,
    gcs_uri: str,
    status: str,
    error_detail: str | None = None,
) -> None:
    """Insert one row into audit_events."""
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO audit_events "
                    "(service_name, context_id, inputs_summary, outputs_summary, error) "
                    "VALUES (:svc, :ctx, :inp, :out, :err)"
                ),
                {
                    "svc": SERVICE_NAME,
                    "ctx": context_id,
                    "inp": f"borrower_id={borrower_id}",
                    "out": f"gcs_uri={gcs_uri} status={status}",
                    "err": error_detail,
                },
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit_write_failed", extra={"error": str(exc), "context_id": context_id})


def process(envelope: dict[str, Any], bq: sqlalchemy.Engine | None = None, gcs: storage.Client | None = None) -> dict[str, Any]:
    """
    Inputs:  Pub/Sub envelope containing context_id, borrower_id, agent_outcome
    Outputs: context_id, gcs_uri, written_at, size_bytes
    """
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        project = _get_project()
        db_engine = bq if bq is not None else _get_engine()
        gcs_client = gcs if gcs is not None else _get_gcs_client()
        context_id = "unknown"
        borrower_id = "unknown"
        gcs_uri = ""

        try:
            bucket_name = _get_bucket_name()
            payload = decode_pubsub_payload(envelope)
            validate_payload(payload)

            context_id = payload["context_id"]
            borrower_id = payload["borrower_id"]
            agent_outcome: dict[str, Any] = payload["agent_outcome"]
            written_at = datetime.now(timezone.utc).isoformat()

            span.set_attribute("context_id", context_id)
            span.set_attribute("borrower_id", borrower_id)

            gcs_uri, size_bytes = write_memo_to_gcs(
                gcs_client,
                bucket_name,
                context_id,
                borrower_id,
                agent_outcome,
                written_at,
            )

            write_audit_event(db_engine, project, context_id, borrower_id, gcs_uri, "success")

            logger.info(
                "memo_written_to_gcs",
                extra={
                    "context_id": context_id,
                    "gcs_uri": gcs_uri,
                    "size_bytes": size_bytes,
                    "status": "success",
                },
            )

            return {
                "context_id": context_id,
                "gcs_uri": gcs_uri,
                "written_at": written_at,
                "size_bytes": size_bytes,
            }

        except (ValueError, RuntimeError) as exc:
            logger.warning(
                "document_store_error",
                extra={"context_id": context_id, "error": str(exc)},
            )
            write_audit_event(db_engine, project, context_id, borrower_id, gcs_uri, "error", str(exc))
            return {"context_id": context_id, "gcs_uri": gcs_uri, "error": str(exc)}


@functions_framework.http
def main(request: Any) -> tuple[str, int, dict[str, str]]:
    """Cloud Run entry point (Pub/Sub push POST, JSON body).

    Always returns HTTP 200 — non-200 causes Pub/Sub redelivery.
    """
    try:
        envelope = request.get_json(force=True) or {}
        result = process(envelope)
        return json.dumps(result), 200, {"Content-Type": "application/json"}
    except Exception as exc:
        logger.error("fatal_error", extra={"error": str(exc)})
        return json.dumps({"error": "internal", "detail": str(exc)}), 200, {"Content-Type": "application/json"}
