"""Test conftest — uses real SQLite, no mocks. Seeds the insider registry tables."""
from __future__ import annotations

import pytest
from sqlalchemy import text


SCHEMA_SQL = [
    """CREATE TABLE IF NOT EXISTS thresholds (
        service_name    TEXT NOT NULL,
        threshold_name  TEXT NOT NULL,
        threshold_value REAL NOT NULL,
        effective_date  TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS audit_events (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        service_name    TEXT NOT NULL,
        context_id      TEXT NOT NULL,
        inputs_summary  TEXT,
        outputs_summary TEXT,
        error           TEXT,
        invoked_at      TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS officers_directors (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id      TEXT NOT NULL,
        role            TEXT NOT NULL,
        effective_from  TEXT NOT NULL,
        effective_to    TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS principal_shareholders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id      TEXT NOT NULL,
        ownership_pct   REAL NOT NULL,
        effective_from  TEXT NOT NULL,
        effective_to    TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS related_interests (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id        TEXT NOT NULL,
        related_to_id     TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        effective_from    TEXT NOT NULL,
        effective_to      TEXT
    )""",
]

THRESHOLD_ROWS = [
    ("insider-screening", "confidence_floor", 0.85, "2024-01-01"),
]

# Test fixture: a small graph
#
#  INSIDER-CEO-1 (executive officer)        DEMO-WHALE-1 (15% shareholder)
#       │                                          │
#       │  family_member_of_owner                  │  controls
#       ↓                                          ↓
#  INSIDER-FAMILY-1                          DEMO-WHALE-LLC
#                                                   │
#                                                   │  has_subsidiary
#                                                   ↓
#                                              DEMO-WHALE-SUB

INSIDER_DIRECT_ROWS = [
    ("INSIDER-CEO-1", "Chief Executive Officer", "2020-01-01", None),
    ("INSIDER-DIR-1", "Director", "2022-06-01", None),
]

PRINCIPAL_ROWS = [
    ("DEMO-WHALE-1", 15.0, "2021-03-01", None),
    ("DEMO-WHALE-PAST", 12.0, "2018-01-01", "2022-12-31"),  # expired — should NOT match
]

RELATED_ROWS = [
    ("INSIDER-FAMILY-1", "INSIDER-CEO-1", "family_member_of", "2020-01-01", None),
    ("DEMO-WHALE-LLC", "DEMO-WHALE-1", "controlled_by", "2021-03-01", None),
    ("DEMO-WHALE-SUB", "DEMO-WHALE-LLC", "has_subsidiary", "2022-01-01", None),
]


@pytest.fixture(autouse=True)
def test_db(tmp_path, monkeypatch):
    """Wire main._engine to a fresh SQLite DB per test. No mocks."""
    import main
    db_url = f"sqlite:///{tmp_path}/test.db"
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setattr(main, "_engine", None)

    engine = main._get_engine()
    with engine.begin() as conn:
        for ddl in SCHEMA_SQL:
            conn.execute(text(ddl))
        conn.execute(
            text("INSERT INTO thresholds (service_name, threshold_name, threshold_value, effective_date) VALUES (:svc, :name, :val, :dt)"),
            [{"svc": r[0], "name": r[1], "val": r[2], "dt": r[3]} for r in THRESHOLD_ROWS],
        )
        conn.execute(
            text("INSERT INTO officers_directors (subject_id, role, effective_from, effective_to) VALUES (:sid, :role, :ef, :et)"),
            [{"sid": r[0], "role": r[1], "ef": r[2], "et": r[3]} for r in INSIDER_DIRECT_ROWS],
        )
        conn.execute(
            text("INSERT INTO principal_shareholders (subject_id, ownership_pct, effective_from, effective_to) VALUES (:sid, :pct, :ef, :et)"),
            [{"sid": r[0], "pct": r[1], "ef": r[2], "et": r[3]} for r in PRINCIPAL_ROWS],
        )
        conn.execute(
            text("INSERT INTO related_interests (subject_id, related_to_id, relationship_type, effective_from, effective_to) VALUES (:sid, :rid, :rt, :ef, :et)"),
            [{"sid": r[0], "rid": r[1], "rt": r[2], "ef": r[3], "et": r[4]} for r in RELATED_ROWS],
        )

    yield engine
