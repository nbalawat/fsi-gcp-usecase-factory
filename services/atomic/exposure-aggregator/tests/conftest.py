"""
Test configuration for exposure-aggregator.

Uses a real SQLite database seeded with test borrower exposures — no mocks.
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
    """CREATE TABLE IF NOT EXISTS loan_exposures (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        borrower_id        TEXT NOT NULL,
        facility_id        TEXT NOT NULL UNIQUE,
        committed_amount   REAL NOT NULL DEFAULT 0,
        outstanding_amount REAL NOT NULL DEFAULT 0,
        as_of_date         TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'active'
    )""",
]

THRESHOLD_ROWS = [
    ("exposure-aggregator", "occ_single_borrower_hard_limit_pct", 25.0,          "2024-01-01"),
    ("exposure-aggregator", "single_borrower_watch_pct",          15.0,          "2024-01-01"),
    ("exposure-aggregator", "single_borrower_elevated_pct",       10.0,          "2024-01-01"),
    ("exposure-aggregator", "tier1_capital_dollars",              100_000_000.0, "2024-01-01"),
]

# Test borrowers — matches the VALID_PAYLOAD fixtures in test_main.py
EXPOSURE_ROWS = [
    ("DEMO-MFG-001", "FAC-MFG-001", 5_000_000.0, 3_500_000.0, "2026-05-06", "active"),
    ("DEMO-RET-005", "FAC-RET-005", 2_000_000.0, 1_800_000.0, "2026-05-06", "active"),
    ("DEMO-HLT-009", "FAC-HLT-009", 8_000_000.0, 6_000_000.0, "2026-05-06", "active"),
    # Borrower with very high exposure for concentration-breach tests
    ("DEMO-WHALE-001", "FAC-WHALE-001", 30_000_000.0, 25_000_000.0, "2026-05-06", "active"),
]


@pytest.fixture(autouse=True)
def test_db(tmp_path, monkeypatch):
    """Wire main._engine to a fresh SQLite DB for every test. No mocks."""
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
            text("INSERT INTO loan_exposures (borrower_id, facility_id, committed_amount, outstanding_amount, as_of_date, status) VALUES (:bid, :fid, :com, :out, :aod, :st)"),
            [{"bid": r[0], "fid": r[1], "com": r[2], "out": r[3], "aod": r[4], "st": r[5]} for r in EXPOSURE_ROWS],
        )

    yield engine
