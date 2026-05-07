"""
Test configuration for financial-spreader.

Uses a real SQLite database — no mocks, no stubs.
The main.py try/except handles bank.logging gracefully when the bank package
is absent, so no stub injection is needed here.
"""
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
]

SEED_ROWS = [
    ("financial-spreader", "debt_to_ebitda_strong",   3.0,  "2024-01-01"),
    ("financial-spreader", "debt_to_ebitda_weak",     6.0,  "2024-01-01"),
    ("financial-spreader", "return_on_assets_strong", 0.05, "2024-01-01"),
    ("financial-spreader", "return_on_assets_weak",   0.01, "2024-01-01"),
]


@pytest.fixture(autouse=True)
def test_db(tmp_path, monkeypatch):
    """Wire main._engine to a fresh SQLite DB for every test. No mocks."""
    import main
    db_url = f"sqlite:///{tmp_path}/test.db"
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setattr(main, "_engine", None)  # force re-init with new URL

    engine = main._get_engine()
    with engine.begin() as conn:
        for ddl in SCHEMA_SQL:
            conn.execute(text(ddl))
        conn.execute(
            text("INSERT INTO thresholds (service_name, threshold_name, threshold_value, effective_date) VALUES (:svc, :name, :val, :dt)"),
            [{"svc": r[0], "name": r[1], "val": r[2], "dt": r[3]} for r in SEED_ROWS],
        )

    yield engine
