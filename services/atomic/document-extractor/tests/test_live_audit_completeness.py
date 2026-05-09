"""LIVE Cloud SQL audit-write tests.

These tests write REAL rows to the dev project's `application_events`
table via the Cloud SQL Auth Proxy, then read them back to verify shape
and forensic completeness. They prove that:

  1. Every successful /extract call produces ≥1 application_events row
     (Rule "audit-event completeness" of the production-grade gates).
  2. Vendor-failure paths also write a row, with event_type=
     'document_extraction_failed' so dashboards can alert on degraded
     outcomes (Rule 3 of product-build-discipline.md — no silent stubs).
  3. The payload contains the per-doc fields the UI's per-document
     panel needs to render: doc_id, doc_type, vendor, vendor_model,
     extracted_fields, citations, missing_required_fields, latency_ms,
     cost_usd.

Setup (locally — CI runs equivalent against a dev project):

    cloud-sql-proxy <project>:<region>:fsi-banking-dev   # in another shell
    export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
    export DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=fsi_app DB_NAME=fsi_banking
    export LIVE_DB_TESTS=1
    export ALLOW_AUDIT_WRITE_FROM_TESTS=1   # ← bypasses the PYTEST_CURRENT_TEST no-op
    pytest tests/test_live_audit_completeness.py -v -s

Each test cleans up after itself (deletes its rows).
"""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path

import pytest
import sqlalchemy
from sqlalchemy import text


LIVE_ENABLED = os.environ.get("LIVE_DB_TESTS") == "1" and os.environ.get("DB_PASS")

pytestmark = pytest.mark.skipif(
    not LIVE_ENABLED,
    reason="Set LIVE_DB_TESTS=1 + DB_PASS to run live DB tests "
           "(see module docstring for full setup)",
)


# Bypass the PYTEST_CURRENT_TEST no-op in audit.py — but only when the
# operator explicitly opts in. This is a guardrail so a test can't
# accidentally write to a shared dev DB just from `pytest -k test_audit`.
if os.environ.get("ALLOW_AUDIT_WRITE_FROM_TESTS") == "1":
    # Force audit.py to actually write
    os.environ.pop("PYTEST_CURRENT_TEST", None)


@pytest.fixture(scope="module")
def db_engine() -> sqlalchemy.Engine:
    """Create a real engine pointing at Cloud SQL via the local proxy."""
    from urllib.parse import quote_plus

    user = os.environ.get("DB_USER", "fsi_app")
    pw = quote_plus(os.environ["DB_PASS"])
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "fsi_banking")
    url = f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}"
    return sqlalchemy.create_engine(url, future=True, pool_pre_ping=True)


def _seed_application_state(db_engine: sqlalchemy.Engine, app_id: str) -> None:
    """Insert a minimal application_state row so the FK on
    application_events(application_id) is satisfied. Real schema:

        application_state(application_id, borrower_id, borrower_name,
                          loan_amount_usd, current_stage, ...)
    """
    with db_engine.begin() as c:
        c.execute(
            text(
                """
                INSERT INTO application_state
                  (application_id, borrower_id, borrower_name,
                   loan_amount_usd, current_stage)
                VALUES
                  (:app_id, 'TEST-AUDIT-COMPLETENESS', 'Test Borrower (audit)',
                   1000000, 'intake')
                ON CONFLICT (application_id) DO NOTHING
                """
            ),
            {"app_id": app_id},
        )


def _cleanup_application(db_engine: sqlalchemy.Engine, app_id: str) -> None:
    """Remove every test-created row in correct FK order."""
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM application_events WHERE application_id = :a"), {"a": app_id})
        c.execute(text("DELETE FROM application_state WHERE application_id = :a"), {"a": app_id})


# ============================================================================
# Insert + read-back: extraction event
# ============================================================================


class TestExtractionEventCompleteness:
    """write_extraction_event populates every regulator-visible field."""

    def test_round_trip_real_db_write(self, db_engine):
        import audit

        app_id = str(uuid.uuid4())
        doc_id = str(uuid.uuid4())
        _seed_application_state(db_engine, app_id)

        payload = {
            "doc_id": doc_id,
            "doc_type": "10-K",
            "vendor": "landing_ai",
            "vendor_model": "extract-20260314",
            "extracted_fields": {
                "fiscal_year_end": "2023-12-31",
                "income_statement": {
                    "revenue": 364482000000,
                    "net_income": 96223000000,
                },
            },
            "citations": [
                {"field_path": "income_statement.revenue", "page": 14,
                 "chunk_id": "ch-real-1", "bbox": [0.1, 0.2, 0.6, 0.25],
                 "excerpt": "Net sales 364,482"},
            ],
            "missing_required_fields": [],
            "missing_preferred_fields": ["customer_concentration.top_5"],
            "credit_usage_units": 35.9,
            "estimated_cost_usd": 0.036,
            "page_count": 152,
            "confidence": 0.92,
            "warnings": [],
        }

        try:
            audit.write_extraction_event(
                application_id=app_id,
                doc_id=doc_id,
                doc_type="10-K",
                payload=payload,
                latency_ms=94887,
                cost_usd=0.036,
            )
        finally:
            # Make sure the test cleans up its row even if the assert fails
            pass

        # Read back via a direct query
        with db_engine.connect() as c:
            row = c.execute(
                text(
                    "SELECT event_type, service_name, payload, latency_ms, cost_usd "
                    "FROM application_events WHERE application_id = :app_id"
                ),
                {"app_id": app_id},
            ).first()

        try:
            assert row is not None, (
                f"audit.write_extraction_event must have inserted a row for {app_id}"
            )
            event_type, service_name, db_payload, latency_ms, cost_usd = row

            assert event_type == "document_extracted"
            assert service_name == "document-extractor"
            assert latency_ms == 94887
            assert float(cost_usd) == 0.036

            # Payload comes back as dict (jsonb)
            assert db_payload["doc_id"] == doc_id
            assert db_payload["doc_type"] == "10-K"
            assert db_payload["vendor"] == "landing_ai"
            assert db_payload["vendor_model"] == "extract-20260314"
            assert db_payload["extracted_fields"]["income_statement"]["revenue"] == 364482000000
            assert len(db_payload["citations"]) == 1
            assert db_payload["citations"][0]["page"] == 14
            assert db_payload["confidence"] == 0.92
            assert db_payload["page_count"] == 152

            # Forensic invariants — these are what dashboards filter on
            assert "vendor" in db_payload, "every audit row must record the vendor"
            assert "extracted_fields" in db_payload
            assert "citations" in db_payload
            assert "missing_required_fields" in db_payload

        finally:
            _cleanup_application(db_engine, app_id)

    def test_failure_event_records_error_code_for_dashboards(self, db_engine):
        """Vendor failures must produce a row with event_type='document_extraction_failed'.
        On-call dashboards filter on this event_type to fire alerts."""
        import audit

        app_id = str(uuid.uuid4())
        doc_id = str(uuid.uuid4())
        _seed_application_state(db_engine, app_id)

        try:
            audit.write_vendor_failure_event(
                application_id=app_id,
                doc_id=doc_id,
                doc_type="10-K",
                vendor="landing_ai",
                error_code="landing_ai_parse_http_422",
                error_message="The PDF appears to be corrupted; "
                              "no readable pages found.",
                latency_ms=1208,
            )

            with db_engine.connect() as c:
                row = c.execute(
                    text(
                        "SELECT event_type, payload FROM application_events "
                        "WHERE application_id = :app_id"
                    ),
                    {"app_id": app_id},
                ).first()

            assert row is not None
            event_type, payload = row

            assert event_type == "document_extraction_failed", (
                "Failure events must use event_type='document_extraction_failed' "
                "so dashboards can filter for degraded outcomes"
            )
            assert payload["vendor"] == "landing_ai"
            assert payload["error_code"] == "landing_ai_parse_http_422"
            assert "corrupted" in payload["error_message"]
            assert payload["status"] == "vendor_failure"

        finally:
            _cleanup_application(db_engine, app_id)


# ============================================================================
# End-to-end: real Landing AI call → real DB write
# ============================================================================


@pytest.mark.skipif(
    not (os.environ.get("LANDING_AI_API_KEY") and LIVE_ENABLED),
    reason="Requires LIVE_DB_TESTS + LANDING_AI_API_KEY (real Landing AI + real DB)",
)
class TestEndToEndAuditTrail:
    """Real PDF → real Landing AI → real audit row, all the way through
    main._handle_extract. This is what runs in production for every doc."""

    def test_smoke_pdf_full_pipeline_writes_audit_row(self, db_engine, monkeypatch):
        import main

        app_id = str(uuid.uuid4())
        doc_id = str(uuid.uuid4())
        _seed_application_state(db_engine, app_id)

        pdf_path = Path(__file__).resolve().parent / "fixtures" / "smoke_10pages.pdf"
        if not pdf_path.exists():
            pytest.skip("Run download.sh + pypdf script first")

        # Force the landing_ai vendor (overrides the conftest default of stub)
        monkeypatch.setenv("DOC_VENDOR", "landing_ai")

        # Use file:// URI so we don't need real GCS
        # _download_from_gcs has a PYTEST escape hatch but we cleared
        # PYTEST_CURRENT_TEST above. Patch the function directly.
        monkeypatch.setattr(
            main, "_download_from_gcs",
            lambda uri: (pdf_path.read_bytes(), pdf_path.name),
        )

        class FakeRequest:
            method = "POST"
            path = "/extract"
            def get_json(self, silent=False):
                return {
                    "application_id": app_id,
                    "doc_id": doc_id,
                    "doc_type": "10-K",
                    "gcs_uri": "gs://test-bucket/smoke_10pages.pdf",
                }

        body, status = main._handle_extract(FakeRequest())

        try:
            # The dispatcher returned 200 (always-200 contract)
            assert status == 200
            assert body["failed"] is False
            assert body["vendor"] == "landing_ai"
            assert body["vendor_model"] is not None
            assert body["page_count"] == 10
            assert body["estimated_cost_usd"] > 0
            assert len(body["citations"]) > 0, (
                "Real Landing AI extraction on a 10-page PDF must produce >0 citations"
            )

            # Real audit row landed in DB
            with db_engine.connect() as c:
                row = c.execute(
                    text(
                        "SELECT event_type, payload, cost_usd, latency_ms "
                        "FROM application_events WHERE application_id = :app_id"
                    ),
                    {"app_id": app_id},
                ).first()

            assert row is not None, (
                "Successful extraction MUST write an audit row "
                "(Rule audit-event completeness)"
            )
            event_type, payload, cost_usd, latency_ms = row

            assert event_type == "document_extracted"
            assert payload["vendor"] == "landing_ai"
            assert payload["page_count"] == 10
            assert len(payload["citations"]) > 0
            assert float(cost_usd) > 0, "real call must report non-zero cost"
            assert latency_ms > 1000, "real call must take >1s"

            print(
                f"\n[live] End-to-end audit verified: cost=${float(cost_usd):.4f}, "
                f"latency={latency_ms}ms, citations={len(payload['citations'])}"
            )

        finally:
            _cleanup_application(db_engine, app_id)
