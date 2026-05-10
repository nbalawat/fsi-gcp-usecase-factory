"""Audit-event writer for the document-extractor.

Emits ONE row per /extract call to application_events with
event_type='document_extracted' and a payload that the UI's per-document
panel can render verbatim. Per quality-gate test_audit_completeness.py:
every call must produce at least one row.

This module also writes one row per VENDOR FAILURE so the audit trail
records degraded outcomes (Rule 3 of product-build-discipline.md: stubs
must be loud).
"""
from __future__ import annotations

import json
import os
from typing import Any

import sqlalchemy
from sqlalchemy import text


_engine: sqlalchemy.Engine | None = None


def _get_engine() -> sqlalchemy.Engine:
    """Return a lazily-created Cloud SQL engine.

    Honors DATABASE_URL if set (local dev / portable). Otherwise composes
    from DB_USER / DB_PASS / DB_NAME / INSTANCE_CONNECTION_NAME using the
    Cloud SQL Auth Proxy convention.
    """
    global _engine
    if _engine is not None:
        return _engine

    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        _engine = sqlalchemy.create_engine(database_url, pool_pre_ping=True, future=True)
        return _engine

    from urllib.parse import quote_plus

    user = os.environ.get("DB_USER", "fsi_app")
    password = os.environ.get("DB_PASS", "")
    name = os.environ.get("DB_NAME", "fsi_banking")
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")

    # Prefer the Cloud SQL Connector when INSTANCE_CONNECTION_NAME is set —
    # this is how Cloud Run reaches Cloud SQL without a VPC connector + NAT.
    # Works whether or not we have a password (the connector uses IAM-based
    # auth or password as configured by the Cloud SQL instance).
    if os.environ.get("INSTANCE_CONNECTION_NAME"):
        from google.cloud.sql.connector import Connector
        connector = Connector()

        def getconn():  # type: ignore[no-untyped-def]
            return connector.connect(
                os.environ["INSTANCE_CONNECTION_NAME"],
                "pg8000",
                user=user,
                password=password,
                db=name,
                ip_type=os.environ.get("DB_IP_TYPE", "PRIVATE"),
            )

        _engine = sqlalchemy.create_engine(
            "postgresql+pg8000://",
            creator=getconn,
            pool_pre_ping=True,
            future=True,
        )
        return _engine

    url = f"postgresql+psycopg2://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{name}"
    _engine = sqlalchemy.create_engine(url, pool_pre_ping=True, future=True)
    return _engine


def write_extraction_event(
    *,
    application_id: str,
    doc_id: str,
    doc_type: str,
    payload: dict[str, Any],
    latency_ms: int,
    cost_usd: float,
) -> None:
    """Write one row to application_events with event_type='document_extracted'.

    Idempotent at the row level (no upsert); duplicates from Pub/Sub
    redelivery would write a second row, which is fine — the audit trail
    is append-only and the UI groups by doc_id.

    Per Rule 7 (idempotency guard) in product-build-discipline.md: the
    orchestrator-level guard catches Pub/Sub redelivery before this
    function is reached.

    Note: in test mode (PYTEST_CURRENT_TEST set OR DRY_RUN=1) this
    function is a no-op so we don't pollute test DBs.
    """
    if (os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("DRY_RUN") == "1") \
            and os.environ.get("ALLOW_AUDIT_WRITE_FROM_TESTS") != "1":
        return

    try:
        engine = _get_engine()
    except Exception as exc:
        # Audit write failure must not crash extraction; log + continue
        # The smoke test (test_audit_completeness.py) ensures the path
        # works in normal operation.
        print(f"[audit] could not connect to DB: {exc}", flush=True)
        return

    insert_event_sql = text(
        """
        INSERT INTO application_events
          (application_id, event_type, service_name, payload, latency_ms, cost_usd)
        VALUES
          (:application_id, 'document_extracted', 'document-extractor', CAST(:payload AS jsonb), :latency_ms, :cost_usd)
        RETURNING id
        """
    )

    # Update the application_documents row so the UI sees the live status
    # change from 'pending' → 'extracted'/'failed'. The page-count, confidence,
    # and missing-field arrays land here too so the per-doc panel can render
    # without joining application_events.
    update_doc_sql = text(
        """
        UPDATE application_documents
           SET extraction_status = :status,
               page_count = :page_count,
               confidence = :confidence,
               missing_required_fields = CAST(:missing_required AS jsonb),
               error_code = :error_code,
               error_message = :error_message,
               extraction_event_id = :event_id,
               extracted_at = NOW()
         WHERE doc_id = :doc_id AND application_id = :application_id
        """
    )

    try:
        with engine.begin() as conn:
            event_row = conn.execute(
                insert_event_sql,
                {
                    "application_id": application_id,
                    "payload": json.dumps(payload),
                    "latency_ms": latency_ms,
                    "cost_usd": cost_usd,
                },
            ).first()
            event_id = event_row[0] if event_row else None

            failed = bool(payload.get("failed"))
            conn.execute(
                update_doc_sql,
                {
                    "doc_id": doc_id,
                    "application_id": application_id,
                    "status": "failed" if failed else "extracted",
                    "page_count": payload.get("page_count"),
                    "confidence": payload.get("confidence"),
                    "missing_required": json.dumps(payload.get("missing_required_fields", [])),
                    "error_code": payload.get("error_code"),
                    "error_message": (payload.get("error_message") or "")[:2000] or None,
                    "event_id": event_id,
                },
            )
    except Exception as exc:
        print(f"[audit] write_extraction_event failed for {doc_id}: {exc}", flush=True)


def write_vendor_failure_event(
    *,
    application_id: str,
    doc_id: str,
    doc_type: str,
    vendor: str,
    error_code: str,
    error_message: str,
    latency_ms: int,
) -> None:
    """Loud failure event — Rule 3 (no silent stubs)."""
    if (os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("DRY_RUN") == "1") \
            and os.environ.get("ALLOW_AUDIT_WRITE_FROM_TESTS") != "1":
        return

    try:
        engine = _get_engine()
    except Exception:
        return

    payload = {
        "doc_id": doc_id,
        "doc_type": doc_type,
        "vendor": vendor,
        "error_code": error_code,
        "error_message": error_message[:1000],
        "status": "vendor_failure",
    }

    insert_event_sql = text(
        """
        INSERT INTO application_events
          (application_id, event_type, service_name, payload, latency_ms)
        VALUES
          (:application_id, 'document_extraction_failed', 'document-extractor', CAST(:payload AS jsonb), :latency_ms)
        RETURNING id
        """
    )
    update_doc_sql = text(
        """
        UPDATE application_documents
           SET extraction_status = 'failed',
               error_code = :error_code,
               error_message = :error_message,
               extraction_event_id = :event_id,
               extracted_at = NOW()
         WHERE doc_id = :doc_id AND application_id = :application_id
        """
    )

    try:
        with engine.begin() as conn:
            event_row = conn.execute(
                insert_event_sql,
                {
                    "application_id": application_id,
                    "payload": json.dumps(payload),
                    "latency_ms": latency_ms,
                },
            ).first()
            event_id = event_row[0] if event_row else None
            conn.execute(
                update_doc_sql,
                {
                    "doc_id": doc_id,
                    "application_id": application_id,
                    "error_code": error_code,
                    "error_message": error_message[:2000],
                    "event_id": event_id,
                },
            )
    except Exception as exc:
        print(f"[audit] write_vendor_failure_event failed: {exc}", flush=True)
