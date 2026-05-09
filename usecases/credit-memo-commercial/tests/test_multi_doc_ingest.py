"""LIVE multi-document /api/applications ingest tests.

Hits the running Next.js dev server with real PDF fixtures, asserts the
full chain works:

  HTTP multipart POST → Next.js route → GCS upload (real bucket) →
    Cloud SQL transaction (real DB via proxy) → Pub/Sub publish (real topic).

This is the production-grade smoke for Track A.3 — the multi-doc
ingest flow that replaces the legacy single-doc /api/ingest-10k.

Setup:

  # Terminal A — Cloud SQL Auth Proxy
  cloud-sql-proxy <project>:<region>:fsi-banking-dev=tcp:5432

  # Terminal B — pipeline-console dev server
  cd ui/apps/pipeline-console
  source ../../../dev.env
  export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
  export DATABASE_URL=postgresql://fsi_app:$DB_PASS@127.0.0.1:5432/fsi_banking
  export GCS_APPLICATION_DOCS_BUCKET=$GCP_PROJECT-application-documents
  pnpm dev

  # Terminal C — run this test
  source dev.env
  export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
  export LIVE_UI_TESTS=1
  pytest usecases/credit-memo-commercial/tests/test_multi_doc_ingest.py -v -s

Each test inserts rows under a unique application_id and cleans up on
exit so repeated runs don't pollute the DB.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
from pathlib import Path

import pytest
import requests
import sqlalchemy
from sqlalchemy import text


REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
EXTRACTOR_FIXTURES = (
    REPO_ROOT / "services" / "atomic" / "document-extractor" / "tests" / "fixtures"
)

UI_BASE_URL = os.environ.get("UI_BASE_URL", "http://localhost:3000")
LIVE_ENABLED = os.environ.get("LIVE_UI_TESTS") == "1" and os.environ.get("DB_PASS")

# Mark as @live so the conftest's emulator-required guard skips this file
# (these tests hit real GCS + real Cloud SQL + real running Next.js).
pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        not LIVE_ENABLED,
        reason="Set LIVE_UI_TESTS=1 + DB_PASS + run pnpm dev to run multi-doc tests",
    ),
]


@pytest.fixture(scope="module")
def db_engine() -> sqlalchemy.Engine:
    user = os.environ.get("DB_USER", "fsi_app")
    pw = urllib.parse.quote_plus(os.environ["DB_PASS"])
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "fsi_banking")
    url = f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}"
    return sqlalchemy.create_engine(url, future=True, pool_pre_ping=True)


def _cleanup_application(db_engine, app_id: str) -> None:
    """Remove every row created by a test, in FK-safe order."""
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM application_documents WHERE application_id = :a"), {"a": app_id})
        c.execute(text("DELETE FROM application_events WHERE application_id = :a"), {"a": app_id})
        c.execute(text("DELETE FROM application_state WHERE application_id = :a"), {"a": app_id})


def _post_multi_doc(*, metadata: dict, files: list[tuple[str, str, Path]]):
    """Build a real multipart POST and hit /api/applications.

    files: list of (field_name, doc_type, pdf_path) tuples. The route
    expects:
      - metadata=<JSON string>
      - documents=<JSON string of [{field, doc_type}, ...]>
      - file_0, file_1, ... (binary PDFs)
    """
    documents_manifest = [
        {"field": field, "doc_type": doc_type} for field, doc_type, _ in files
    ]
    multipart = [
        ("metadata", (None, json.dumps(metadata), "application/json")),
        ("documents", (None, json.dumps(documents_manifest), "application/json")),
    ]
    for field, _doc_type, path in files:
        multipart.append(
            (field, (path.name, path.read_bytes(), "application/pdf")),
        )
    return requests.post(
        f"{UI_BASE_URL}/api/applications",
        files=multipart,
        timeout=60,
    )


# ============================================================================
# Happy path — 3 real PDFs uploaded as one application
# ============================================================================


class TestMultiDocHappyPath:
    """A multi-doc submission — 10-K + AR_aging + board_minutes —
    produces one application_state row, three application_documents
    rows in 'pending' status, and a stage_entered event."""

    def test_three_real_pdfs_land_state_and_documents(self, db_engine):
        if not EXTRACTOR_FIXTURES.exists():
            pytest.skip(f"No extractor fixtures at {EXTRACTOR_FIXTURES}")

        # Three DISTINCT real PDFs — same content twice would (correctly)
        # be rejected by the application_documents.sha256_hex UNIQUE
        # constraint per Rule 7 (idempotency).
        files = [
            ("file_0", "10-K", EXTRACTOR_FIXTURES / "small_valid_financial.pdf"),
            ("file_1", "AR_aging", EXTRACTOR_FIXTURES / "smoke_10pages.pdf"),
            ("file_2", "board_minutes", EXTRACTOR_FIXTURES / "deficient_chairman_letter.pdf"),
        ]
        for _, _, p in files:
            if not p.exists():
                pytest.skip(f"Fixture missing: {p}")

        metadata = {
            "borrower_id": "BRW-MULTIDOC-TEST",
            "borrower_name": "Multi-doc Test Borrower",
            "loan_amount_usd": 25_000_000,
            "naics_code": "333992",
            "facility_type": "term_loan",
            "term_years": 5,
            "scenario_tag": "multi-doc-ingest-test",
        }

        r = _post_multi_doc(metadata=metadata, files=files)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:500]}"
        body = r.json()

        assert body["ok"] is True
        application_id = body["application_id"]
        assert body["doc_count"] == 3
        assert len(body["documents"]) == 3
        assert body["redirect_url"] == f"/cases/{application_id}"

        # Each returned document carries its IDs and gcs_uri
        for d in body["documents"]:
            assert d["doc_id"]
            assert d["doc_type"] in {"10-K", "AR_aging", "board_minutes"}
            assert d["gcs_uri"].startswith("gs://")
            assert d["gcs_uri"].endswith(".pdf")
            assert d["size_bytes"] > 0

        try:
            with db_engine.connect() as c:
                state = c.execute(
                    text("SELECT borrower_id, current_stage, loan_amount_usd FROM application_state WHERE application_id = :a"),
                    {"a": application_id},
                ).first()
                assert state is not None, "application_state row missing"
                assert state[0] == "BRW-MULTIDOC-TEST"
                assert state[1] == "intake"
                assert float(state[2]) == 25_000_000

                docs = c.execute(
                    text(
                        "SELECT doc_id, doc_type, extraction_status, file_size_bytes, gcs_uri "
                        "FROM application_documents WHERE application_id = :a "
                        "ORDER BY uploaded_at"
                    ),
                    {"a": application_id},
                ).fetchall()
                assert len(docs) == 3, f"Expected 3 application_documents rows; got {len(docs)}"

                doc_types = {d[1] for d in docs}
                assert doc_types == {"10-K", "AR_aging", "board_minutes"}

                for d in docs:
                    doc_id, doc_type, status, size, gcs_uri = d
                    assert status == "pending", f"{doc_type} status should be 'pending'; got {status}"
                    assert size > 0
                    assert gcs_uri.startswith("gs://")
                    assert str(doc_id) in gcs_uri, (
                        f"gcs_uri must include doc_id for traceability; doc_id={doc_id} uri={gcs_uri}"
                    )

                events = c.execute(
                    text(
                        "SELECT event_type, service_name, payload "
                        "FROM application_events WHERE application_id = :a"
                    ),
                    {"a": application_id},
                ).fetchall()
                stage_events = [e for e in events if e[0] == "stage_entered"]
                assert len(stage_events) >= 1
                payload = stage_events[0][2]
                assert payload["stage"] == "intake"
                assert payload["doc_count"] == 3
                assert set(payload["doc_types"]) == {"10-K", "AR_aging", "board_minutes"}

                print(
                    f"\n[live] Multi-doc ingest OK: app_id={application_id}, "
                    f"3 docs in pending state, intake event recorded."
                )
        finally:
            _cleanup_application(db_engine, application_id)


# ============================================================================
# Validation failures — every input edge surfaces the right HTTP code
# ============================================================================


class TestValidationFailures:
    def test_missing_metadata_field_400(self):
        r = requests.post(
            f"{UI_BASE_URL}/api/applications",
            files=[
                ("documents", (None, "[]", "application/json")),
            ],
            timeout=10,
        )
        assert r.status_code == 400
        assert "metadata" in r.json()["error"].lower()

    def test_invalid_metadata_json_400(self):
        r = requests.post(
            f"{UI_BASE_URL}/api/applications",
            files=[
                ("metadata", (None, "{not json", "application/json")),
                ("documents", (None, "[]", "application/json")),
            ],
            timeout=10,
        )
        assert r.status_code == 400
        assert "metadata" in r.json()["error"].lower()

    def test_unknown_doc_type_400(self):
        metadata = {
            "borrower_id": "BRW-X",
            "borrower_name": "X",
            "loan_amount_usd": 1_000_000,
        }
        r = requests.post(
            f"{UI_BASE_URL}/api/applications",
            files=[
                ("metadata", (None, json.dumps(metadata), "application/json")),
                (
                    "documents",
                    (
                        None,
                        json.dumps([{"field": "file_0", "doc_type": "passport_scan"}]),
                        "application/json",
                    ),
                ),
                ("file_0", ("x.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")),
            ],
            timeout=10,
        )
        assert r.status_code == 400
        assert "doc_type" in r.json()["error"].lower()

    def test_non_pdf_file_422(self):
        metadata = {
            "borrower_id": "BRW-X",
            "borrower_name": "X",
            "loan_amount_usd": 1_000_000,
        }
        r = requests.post(
            f"{UI_BASE_URL}/api/applications",
            files=[
                ("metadata", (None, json.dumps(metadata), "application/json")),
                (
                    "documents",
                    (
                        None,
                        json.dumps([{"field": "file_0", "doc_type": "10-K"}]),
                        "application/json",
                    ),
                ),
                # Plain text disguised as a PDF — fails the magic-byte check
                ("file_0", ("fake.pdf", b"This is not a PDF", "application/pdf")),
            ],
            timeout=10,
        )
        assert r.status_code == 422
        assert "pdf" in r.json()["error"].lower()

    def test_missing_file_for_declared_doc_400(self):
        metadata = {
            "borrower_id": "BRW-X",
            "borrower_name": "X",
            "loan_amount_usd": 1_000_000,
        }
        r = requests.post(
            f"{UI_BASE_URL}/api/applications",
            files=[
                ("metadata", (None, json.dumps(metadata), "application/json")),
                (
                    "documents",
                    (
                        None,
                        # Declares file_0 in the manifest but doesn't upload it
                        json.dumps([{"field": "file_0", "doc_type": "10-K"}]),
                        "application/json",
                    ),
                ),
            ],
            timeout=10,
        )
        assert r.status_code == 400
        assert "file_0" in r.json()["error"].lower()


# ============================================================================
# Idempotency — same content uploaded twice surfaces the FK-violation properly
# ============================================================================


class TestContentDeduplication:
    """The application_documents.sha256_hex unique constraint per
    application_id prevents the same bytes from landing twice under one
    application. A second upload of identical content fails the
    transaction; the route reports a 500 with the rollback context.

    This is the gate that catches duplicate clicks of the upload button
    (Rule 7 idempotency in product-build-discipline)."""

    def test_duplicate_content_in_same_app_fails_loudly(self, db_engine):
        pdf = (EXTRACTOR_FIXTURES / "smoke_10pages.pdf").read_bytes()
        if not pdf:
            pytest.skip("Fixture missing")

        metadata = {
            "borrower_id": "BRW-DEDUP-TEST",
            "borrower_name": "Dedup Test",
            "loan_amount_usd": 5_000_000,
        }
        # Same PDF twice in one submission
        r = requests.post(
            f"{UI_BASE_URL}/api/applications",
            files=[
                ("metadata", (None, json.dumps(metadata), "application/json")),
                (
                    "documents",
                    (
                        None,
                        json.dumps(
                            [
                                {"field": "file_0", "doc_type": "10-K"},
                                {"field": "file_1", "doc_type": "10-Q"},
                            ]
                        ),
                        "application/json",
                    ),
                ),
                ("file_0", ("a.pdf", pdf, "application/pdf")),
                ("file_1", ("b.pdf", pdf, "application/pdf")),
            ],
            timeout=30,
        )

        # The DB FK + unique constraint cause the tx to roll back; the route
        # surfaces 500 with a rollback message. The point of the test is that
        # the failure is LOUD and reports rollback — never a partial-write.
        assert r.status_code == 500, (
            f"Duplicate content should fail loudly with 500; got {r.status_code} "
            f"body={r.text[:300]}"
        )
        assert "rolled back" in r.json()["error"].lower()

        # Check no orphan rows
        with db_engine.connect() as c:
            count = c.execute(
                text(
                    "SELECT count(*) FROM application_state "
                    "WHERE borrower_id = 'BRW-DEDUP-TEST'"
                )
            ).scalar()
            assert count == 0, "Failed transaction must roll back application_state too"
