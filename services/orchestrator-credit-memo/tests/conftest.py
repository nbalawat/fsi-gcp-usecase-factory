"""
Test harness for orchestrator-credit-memo.

- SQLite-backed application_state / application_events / application_artifacts.
- HTTP requests to atomic services + rules-service intercepted via a monkeypatched
  `_post_json` that returns canned responses (no real network).
- Anthropic SDK is forced "missing" via ORCHESTRATOR_SKIP_AUTH=1 + unsetting
  ANTHROPIC_API_KEY, so the deterministic stub agent path runs.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
import requests
from sqlalchemy import text

# Make `import main` work whether pytest is invoked from the service dir or repo root.
SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))


SCHEMA_SQL = [
    """CREATE TABLE IF NOT EXISTS application_state (
        application_id        TEXT PRIMARY KEY,
        borrower_id           TEXT NOT NULL,
        borrower_name         TEXT NOT NULL,
        naics_code            TEXT,
        loan_amount_usd       REAL NOT NULL,
        scenario_tag          TEXT,
        current_stage         TEXT NOT NULL,
        decision              TEXT,
        risk_band             TEXT,
        dscr_base             REAL,
        dscr_stressed         REAL,
        leverage_base         REAL,
        single_borrower_pct   REAL,
        agent_confidence      REAL,
        citation_density      REAL,
        regulatory_deadline   TEXT,
        clock_started_at      TEXT,
        stuck                 INTEGER DEFAULT 0,
        alert                 TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL,
        last_event_at         TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS application_events (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id    TEXT NOT NULL,
        event_type        TEXT NOT NULL,
        service_name      TEXT,
        payload           TEXT NOT NULL,
        occurred_at       TEXT NOT NULL,
        latency_ms        INTEGER,
        cost_usd          REAL
    )""",
    """CREATE TABLE IF NOT EXISTS application_artifacts (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id    TEXT NOT NULL,
        artifact_type     TEXT NOT NULL,
        revision_number   INTEGER NOT NULL DEFAULT 1,
        author            TEXT NOT NULL,
        body              TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        UNIQUE (application_id, artifact_type, revision_number)
    )""",
]


# ── Canned atomic-service / rules-service responses ────────────────────────

ATOMIC_RESPONSES: dict[str, dict] = {
    "financial-spreader": {
        "spread_income_statement": {"revenue": 100_000_000, "ebitda": 18_000_000},
        "spread_balance_sheet": {"total_debt": 30_000_000, "total_equity": 50_000_000},
        "spread_cash_flow": {"free_cash_flow": 11_000_000},
        "ratios": {"debt_to_ebitda": 1.67, "return_on_assets": 0.125},
        "ratio_quality": {"debt_to_ebitda": "strong"},
    },
    "dscr-calculator": {"dscr_base": 1.45, "dscr_stressed": 1.18},
    "covenant-analyzer": {"min_headroom_pct": 12.5, "covenants": []},
    "peer-benchmarker": {"peer_median_ebitda_margin": 0.14},
    "industry-risk-scorer": {"industry_score": 0.62, "industry_band": "moderate"},
    "collateral-valuator": {"coverage_ratio": 1.85, "lendable_value_usd": 18_500_000},
    "exposure-aggregator": {
        "single_borrower_pct": 4.2,
        "sector_concentration_pct": 12.0,
        "geographic_concentration_pct": 9.0,
        "cre_concentration_pct": 0.0,
    },
    "insider-screening": {
        "insider_aggregate_pct": 0.5,
        "individual_insider_pct": 0.0,
        "matches": [],
    },
}


RULES_DEFAULT = {
    "decision": "APPROVE",
    "reason": "all checks pass",
    "outputs": {"detail": "ok"},
    "evaluated_at": "2026-05-07T00:00:00Z",
}


@pytest.fixture(autouse=True)
def test_env(tmp_path, monkeypatch):
    """Wire main._engine to fresh SQLite, monkeypatch _post_json + OIDC, set service URLs."""
    import main

    db_url = f"sqlite:///{tmp_path}/test.db"
    monkeypatch.setenv("DATABASE_URL", db_url)
    # Force OIDC token fetch off (no GCP metadata server in tests).
    monkeypatch.setenv("ORCHESTRATOR_SKIP_AUTH", "1")
    # Make sure the agent stub path runs deterministically.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # Service URLs — anything non-empty enables _invoke_atomic to attempt a call.
    for svc in main._ATOMIC_SERVICES:
        env_key = f"ATOMIC_{svc.upper().replace('-', '_')}_URL"
        monkeypatch.setenv(env_key, f"https://stub.invalid/{svc}")
    monkeypatch.setenv("RULES_SERVICE_URL", "https://stub.invalid/rules-service")
    monkeypatch.delenv("GCP_PROJECT", raising=False)  # so _publish() is a no-op

    monkeypatch.setattr(main, "_engine", None)
    engine = main._get_engine()
    with engine.begin() as conn:
        for ddl in SCHEMA_SQL:
            conn.execute(text(ddl))

    # ── Monkeypatch _post_json to return canned atomic / rules responses ──
    class FakeResp:
        def __init__(self, status: int, body: dict):
            self.status_code = status
            self._body = body
            self.text = json.dumps(body)

        def json(self):
            return self._body

    def fake_post_json(url, payload, timeout=30.0):  # noqa: ARG001
        for svc, resp in ATOMIC_RESPONSES.items():
            if svc in url:
                return FakeResp(200, resp)
        if "rules-service" in url:
            rule_set = payload.get("rule_set", "")
            return FakeResp(200, {**RULES_DEFAULT, "rule_set": rule_set})
        return FakeResp(404, {"error": "no stub"})

    monkeypatch.setattr(main, "_post_json", fake_post_json)

    # Ensure the Anthropic SDK path is never tried — but it's already gated by
    # the missing ANTHROPIC_API_KEY env var.

    yield engine


@pytest.fixture
def enriched_event_body():
    """A synthetic .enriched payload mirroring what the handler publishes."""
    return {
        "borrower_id": "DEMO-MFG-001",
        "borrower_name": "Acme Welding Co",
        "loan_amount": 5_000_000,
        "loan_type": "term_loan",
        "naics_code": "333992",
        "primary_state": "TX",
        "context_id": "test-ctx-001",
        "application_id": "11111111-1111-1111-1111-111111111111",
        "income_statement": {
            "revenue": 100_000_000,
            "cogs": 60_000_000,
            "ebitda": 18_000_000,
            "interest_expense": 2_000_000,
            "net_income": 10_000_000,
        },
        "balance_sheet": {
            "total_assets": 80_000_000,
            "total_debt": 30_000_000,
            "total_equity": 50_000_000,
            "current_assets": 25_000_000,
            "current_liabilities": 12_000_000,
        },
        "cash_flow": {"operating_cash_flow": 15_000_000, "capex": -4_000_000},
        "annual_principal": 1_000_000,
        "proposed_covenants": [
            {"covenant": "debt_to_ebitda", "threshold": 4.0},
        ],
        "collateral": [{"type": "real_estate", "appraised_value_usd": 9_000_000}],
        "borrower_master": {"legal_name": "Acme Welding Co", "naics_code": "333992"},
    }
