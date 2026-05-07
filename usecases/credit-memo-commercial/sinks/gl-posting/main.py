"""
gl-posting: receive approved credit memo via Pub/Sub and post a GL entry to Cloud SQL.

Step-5 sink — stateless, no business rules.
Accepts Pub/Sub push format. Writes to gl_postings and audit_events tables.
Returns HTTP 200 always (Pub/Sub ack convention).
"""
from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import functions_framework
import sqlalchemy
from opentelemetry import trace
from sqlalchemy import text

from bank.logging import redacting_logger

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)

SERVICE_NAME = "gl-posting"

_engine: sqlalchemy.Engine | None = None


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


def _get_project() -> str:
    return os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "local-dev"))


def _get_gl_account() -> str:
    return os.environ.get("GL_ACCOUNT_DEFAULT", "10100-CREDIT-MEMO")


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
    required = ["context_id", "borrower_id", "approver_decision", "credit_memo"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValueError(f"missing required fields: {missing}")
    if not isinstance(payload["credit_memo"], dict):
        raise ValueError("credit_memo must be an object")
    if not isinstance(payload["approver_decision"], dict):
        raise ValueError("approver_decision must be an object")
    if "loan_amount" not in payload["credit_memo"]:
        raise ValueError("credit_memo missing loan_amount")


def write_gl_entry(
    engine: sqlalchemy.Engine,
    project: str,
    context_id: str,
    borrower_id: str,
    loan_amount: float,
    approver_id: str,
    posted_at: str,
    gl_entry_id: str,
) -> None:
    """INSERT one row into gl_postings (idempotent via ON CONFLICT DO NOTHING)."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO gl_postings "
                "(context_id, borrower_id, loan_amount, approver_id, gl_account, memo_ref) "
                "VALUES (:ctx, :bid, :amount, :approver, :account, :ref) "
                "ON CONFLICT (context_id) DO NOTHING"
            ),
            {
                "ctx": context_id,
                "bid": borrower_id,
                "amount": loan_amount,
                "approver": approver_id,
                "account": _get_gl_account(),
                "ref": context_id,
            },
        )


def write_audit_event(
    engine: sqlalchemy.Engine,
    project: str,
    context_id: str,
    borrower_id: str,
    gl_entry_id: str,
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
                    "inp": f"borrower_id={borrower_id} gl_entry_id={gl_entry_id}",
                    "out": f"status={status}",
                    "err": error_detail,
                },
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit_write_failed", extra={"error": str(exc), "context_id": context_id})


def process(envelope: dict[str, Any], engine: sqlalchemy.Engine | None = None) -> dict[str, Any]:
    """
    Inputs:  Pub/Sub envelope containing context_id, borrower_id, approver_decision, credit_memo
    Outputs: context_id, gl_entry_id, posted_at
    """
    with tracer.start_as_current_span(SERVICE_NAME) as span:
        project = _get_project()
        db_engine = engine if engine is not None else _get_engine()
        gl_entry_id = str(uuid.uuid4())
        context_id = "unknown"
        borrower_id = "unknown"

        try:
            payload = decode_pubsub_payload(envelope)
            validate_payload(payload)

            context_id = payload["context_id"]
            borrower_id = payload["borrower_id"]
            credit_memo: dict[str, Any] = payload["credit_memo"]
            approver_decision: dict[str, Any] = payload["approver_decision"]

            loan_amount = float(credit_memo["loan_amount"])
            approver_id = str(approver_decision.get("approver_id", ""))
            approved_at = approver_decision.get(
                "approved_at",
                datetime.now(timezone.utc).isoformat(),
            )
            posted_at = str(approved_at)

            span.set_attribute("context_id", context_id)
            span.set_attribute("borrower_id", borrower_id)

            write_gl_entry(
                db_engine,
                project,
                context_id,
                borrower_id,
                loan_amount,
                approver_id,
                posted_at,
                gl_entry_id,
            )

            write_audit_event(db_engine, project, context_id, borrower_id, gl_entry_id, "success")

            logger.info(
                "gl_entry_posted",
                extra={"context_id": context_id, "gl_entry_id": gl_entry_id, "status": "success"},
            )

            return {"context_id": context_id, "gl_entry_id": gl_entry_id, "posted_at": posted_at}

        except (ValueError, RuntimeError) as exc:
            logger.warning(
                "gl_posting_error",
                extra={"context_id": context_id, "error": str(exc)},
            )
            write_audit_event(
                db_engine,
                project,
                context_id,
                borrower_id,
                gl_entry_id,
                "error",
                str(exc),
            )
            return {"context_id": context_id, "gl_entry_id": gl_entry_id, "error": str(exc)}


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
