"""Real-DB tests for audit-writer.

Each test seeds an application_state row, hits one of the three audit-
writer endpoints, then queries Cloud SQL to verify the write landed.

Run:
  source dev.env
  export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
  export LIVE_DB_TESTS=1 DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=fsi_app DB_NAME=fsi_banking
  PYTHONPATH=services/audit-writer pytest services/audit-writer/tests/ -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import urllib.parse
import uuid
from pathlib import Path

import pytest
import sqlalchemy
from sqlalchemy import text


os.environ.setdefault("PYTEST_CURRENT_TEST", "1")
os.environ.setdefault("CI_SKIP_ASSERT_ENV", "1")


LIVE_ENABLED = os.environ.get("LIVE_DB_TESTS") == "1" and os.environ.get("DB_PASS")

pytestmark = pytest.mark.skipif(
    not LIVE_ENABLED,
    reason="Set LIVE_DB_TESTS=1 + DB_PASS to run audit-writer tests",
)


def _load_main():
    spec = importlib.util.spec_from_file_location(
        "_aw_main",
        Path(__file__).resolve().parent.parent / "main.py",
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def db_engine() -> sqlalchemy.Engine:
    user = os.environ.get("DB_USER", "fsi_app")
    pw = urllib.parse.quote_plus(os.environ["DB_PASS"])
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "fsi_banking")
    return sqlalchemy.create_engine(
        f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}",
        future=True,
        pool_pre_ping=True,
    )


def _seed_state(db_engine, app_id: str) -> None:
    with db_engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO application_state "
                "(application_id, borrower_id, borrower_name, loan_amount_usd, current_stage) "
                "VALUES (:a, 'BRW-AW-TEST', 'Audit-Writer Test', 1000000, 'intake')"
            ),
            {"a": app_id},
        )


def _cleanup(db_engine, app_id: str) -> None:
    with db_engine.begin() as c:
        c.execute(text("DELETE FROM application_artifacts WHERE application_id = :a"), {"a": app_id})
        c.execute(text("DELETE FROM application_events WHERE application_id = :a"), {"a": app_id})
        c.execute(text("DELETE FROM application_state WHERE application_id = :a"), {"a": app_id})


class FakeRequest:
    def __init__(self, *, method: str, path: str, json_body: dict | None = None):
        self.method = method
        self.path = path
        self._body = json_body

    def get_json(self, force: bool = False, silent: bool = False):
        return self._body


# ============================================================================
# /event
# ============================================================================


class TestEventEndpoint:
    def test_writes_row_with_full_payload(self, db_engine):
        m = _load_main()
        app_id = str(uuid.uuid4())
        _seed_state(db_engine, app_id)
        try:
            body = {
                "application_id": app_id,
                "event_type": "service_invoked",
                "service_name": "loan-serviceability",
                "payload": {"endpoint": "/dscr", "result_summary": "DSCR 1.45"},
                "latency_ms": 234,
                "cost_usd": 0.001,
            }
            resp_body, status, _ = m.http(
                FakeRequest(method="POST", path="/event", json_body=body),
            )
            assert status == 200, f"got {status}: {resp_body}"
            event_id = json.loads(resp_body)["event_id"]
            assert event_id > 0

            with db_engine.connect() as c:
                row = c.execute(
                    text(
                        "SELECT event_type, service_name, payload, latency_ms, cost_usd "
                        "FROM application_events WHERE id = :i"
                    ),
                    {"i": event_id},
                ).first()
            assert row is not None
            assert row[0] == "service_invoked"
            assert row[1] == "loan-serviceability"
            assert row[2]["endpoint"] == "/dscr"
            assert row[3] == 234
            assert float(row[4]) == 0.001
        finally:
            _cleanup(db_engine, app_id)

    def test_invalid_body_returns_422(self):
        m = _load_main()
        # Missing required application_id
        resp_body, status, _ = m.http(
            FakeRequest(method="POST", path="/event", json_body={"event_type": "x"}),
        )
        assert status == 422
        assert "invalid_request" in resp_body


# ============================================================================
# /artifact
# ============================================================================


class TestArtifactEndpoint:
    def test_writes_artifact(self, db_engine):
        m = _load_main()
        app_id = str(uuid.uuid4())
        _seed_state(db_engine, app_id)
        try:
            body = {
                "application_id": app_id,
                "artifact_type": "return_notice",
                "revision_number": 1,
                "author": "workflow",
                "body": {
                    "decision": "RETURN_FOR_REVISION",
                    "missing_items": [{"code": "missing_doc_type"}],
                },
            }
            resp_body, status, _ = m.http(
                FakeRequest(method="POST", path="/artifact", json_body=body),
            )
            assert status == 200, f"got {status}: {resp_body}"

            with db_engine.connect() as c:
                row = c.execute(
                    text(
                        "SELECT artifact_type, author, body FROM application_artifacts "
                        "WHERE application_id = :a"
                    ),
                    {"a": app_id},
                ).first()
            assert row is not None
            assert row[0] == "return_notice"
            assert row[1] == "workflow"
            assert row[2]["decision"] == "RETURN_FOR_REVISION"
        finally:
            _cleanup(db_engine, app_id)

    def test_upsert_replaces_body(self, db_engine):
        """Same (application_id, artifact_type, revision_number) twice
        upserts — the new body wins. Idempotent for workflow retries."""
        m = _load_main()
        app_id = str(uuid.uuid4())
        _seed_state(db_engine, app_id)
        try:
            base = {
                "application_id": app_id,
                "artifact_type": "return_notice",
                "revision_number": 1,
                "author": "workflow",
            }
            m.http(FakeRequest(method="POST", path="/artifact",
                               json_body={**base, "body": {"v": 1}}))
            m.http(FakeRequest(method="POST", path="/artifact",
                               json_body={**base, "body": {"v": 2}}))
            with db_engine.connect() as c:
                rows = c.execute(
                    text("SELECT body FROM application_artifacts WHERE application_id = :a"),
                    {"a": app_id},
                ).fetchall()
            assert len(rows) == 1, "Upsert must produce one row, not two"
            assert rows[0][0]["v"] == 2
        finally:
            _cleanup(db_engine, app_id)


# ============================================================================
# /state
# ============================================================================


class TestStateEndpoint:
    def test_selective_update(self, db_engine):
        """Only the columns provided in the request are written;
        other columns stay unchanged."""
        m = _load_main()
        app_id = str(uuid.uuid4())
        _seed_state(db_engine, app_id)
        try:
            body = {
                "application_id": app_id,
                "current_stage": "approval",
                "decision": "APPROVE",
                "risk_band": "1-pass",
                "dscr_base": 1.45,
            }
            resp_body, status, _ = m.http(
                FakeRequest(method="POST", path="/state", json_body=body),
            )
            assert status == 200, f"got {status}: {resp_body}"
            updated = json.loads(resp_body)["updated_columns"]
            assert set(updated) == {"current_stage", "decision", "risk_band", "dscr_base"}

            with db_engine.connect() as c:
                row = c.execute(
                    text(
                        "SELECT current_stage, decision, risk_band, dscr_base, borrower_id "
                        "FROM application_state WHERE application_id = :a"
                    ),
                    {"a": app_id},
                ).first()
            assert row[0] == "approval"
            assert row[1] == "APPROVE"
            assert row[2] == "1-pass"
            assert float(row[3]) == 1.45
            # borrower_id (not in update payload) must be unchanged
            assert row[4] == "BRW-AW-TEST"
        finally:
            _cleanup(db_engine, app_id)

    def test_no_fields_returns_400(self):
        m = _load_main()
        resp_body, status, _ = m.http(
            FakeRequest(
                method="POST",
                path="/state",
                json_body={"application_id": str(uuid.uuid4())},
            ),
        )
        assert status == 400
        assert "no_fields_to_update" in resp_body

    def test_unknown_application_id_returns_404(self):
        m = _load_main()
        resp_body, status, _ = m.http(
            FakeRequest(
                method="POST",
                path="/state",
                json_body={
                    "application_id": str(uuid.uuid4()),
                    "current_stage": "approval",
                },
            ),
        )
        assert status == 404


# ============================================================================
# Routing
# ============================================================================


class TestRouting:
    def test_health(self):
        m = _load_main()
        body, status, _ = m.http(FakeRequest(method="GET", path="/health"))
        assert status == 200
        assert json.loads(body)["service"] == "audit-writer"

    def test_unknown_path_404(self):
        m = _load_main()
        _, status, _ = m.http(FakeRequest(method="GET", path="/nope"))
        assert status == 404
