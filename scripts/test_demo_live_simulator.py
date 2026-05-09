"""Unit tests for ``scripts/demo_live_simulator.py``.

Run with::

    python3 -m pytest scripts/test_demo_live_simulator.py -v

These tests do NOT publish to live Pub/Sub. The ``PublisherClient`` is
replaced with a stub that records the call and returns a fake message id.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Make the scripts/ directory importable.
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import demo_live_simulator as sim  # noqa: E402

EXPECTED_BORROWERS = {
    "BRW-LECO", "BRW-APEX-MFG", "BRW-RIDGE-HC", "BRW-NRTH-MTL",
    "BRW-SUMMIT-RT", "BRW-LIGHT-HC", "BRW-DELTA-CN", "BRW-PEAK-LOG",
    "BRW-VINEYARD", "BRW-IRONFOR", "BRW-COASTER", "BRW-INSIDER",
}


# ---------------------------------------------------------------------------
# 1. Fixture sanity — schema + ratios
# ---------------------------------------------------------------------------
def test_all_12_fixtures_present_and_valid():
    fixtures = sim.load_fixtures()
    assert set(fixtures) == EXPECTED_BORROWERS, (
        f"missing/extra borrowers: "
        f"{EXPECTED_BORROWERS.symmetric_difference(fixtures)}"
    )

    seen_tags: set[str] = set()
    for bid, payload in fixtures.items():
        # validate_fixture is called inside load_fixtures, so a successful
        # load already passes schema. Here we double-check ratio invariants
        # the demo relies on.
        inc = payload["financial_statements"]["income_statement"]["fy2025"]
        bs = payload["financial_statements"]["balance_sheet"]["fy2025"]
        lr = payload["loan_request"]

        # Implied leverage and DSCR must be derivable and finite
        leverage = bs["total_debt"] / inc["ebitda"]
        annual_principal = lr["amount_usd"] / lr["term_years"]
        dscr = inc["ebitda"] / (annual_principal + inc["interest_expense"])
        assert 0 < leverage < 10, f"{bid}: leverage {leverage:.2f}x out of range"
        assert 0 < dscr < 100, f"{bid}: dscr {dscr:.2f} out of range"

        # net_income roughly tracks ebitda - depreciation - interest - tax
        approx_ni = (inc["ebitda"] - inc["depreciation"]
                     - inc["interest_expense"] - inc["tax"])
        # allow 10% slack to absorb other income/expense items
        assert abs(inc["net_income"] - approx_ni) <= max(abs(approx_ni) * 0.10,
                                                         50_000), (
            f"{bid}: net_income {inc['net_income']} drifts from "
            f"ebitda-D&A-int-tax {approx_ni}"
        )

        # cogs < revenue and ebitda < revenue
        assert inc["cogs"] < inc["revenue"]
        assert inc["ebitda"] < inc["revenue"] - inc["cogs"] + 1, (
            f"{bid}: ebitda exceeds gross profit"
        )

        # top-5 sums to <= 1.0 and is sorted descending
        top5 = payload["customer_concentration"]["top_5_pct"]
        assert sum(top5) <= 1.0001
        assert top5 == sorted(top5, reverse=True), f"{bid}: top_5_pct not sorted"

        seen_tags.add(payload["scenario_tag"])

    # Every fixture has a unique scenario_tag and all 12 are exercised.
    assert seen_tags == sim.ALLOWED_SCENARIO_TAGS, (
        f"scenario_tag coverage gap: "
        f"{sim.ALLOWED_SCENARIO_TAGS.symmetric_difference(seen_tags)}"
    )


# ---------------------------------------------------------------------------
# 2. --once with a mocked PublisherClient
# ---------------------------------------------------------------------------
def _stub_publisher():
    """Return a MagicMock standing in for ``pubsub_v1.PublisherClient``."""
    publisher = MagicMock(name="PublisherClient")
    publisher.topic_path.side_effect = lambda p, t: f"projects/{p}/topics/{t}"
    future = MagicMock(name="PublishFuture")
    future.result.return_value = "fake-msg-id-001"
    publisher.publish.return_value = future
    return publisher


def test_once_publishes_exactly_one_message_with_expected_shape(capsys):
    publisher = _stub_publisher()
    summary = sim.run(
        cadence_seconds=1,
        duration_minutes=1,
        project="agentic-experiments",
        topic="loans.application.submitted",
        seed=42,
        once=True,
        borrower="BRW-LECO",
        publisher=publisher,
        borrower_master={},  # skip DB read
    )

    assert summary["published"] == 1
    assert publisher.publish.call_count == 1

    args, kwargs = publisher.publish.call_args
    assert args[0] == "projects/agentic-experiments/topics/loans.application.submitted"
    assert kwargs["event_type"] == "loans.application.submitted"
    assert kwargs["scenario_tag"] == "happy-path"
    assert kwargs["borrower_id"] == "BRW-LECO"

    body = json.loads(kwargs["data"].decode("utf-8"))
    for field in (
        "application_id", "borrower_id", "borrower_name", "loan_amount",
        "loan_type", "naics_code", "submitted_at", "scenario_tag",
        "loan_request", "financial_statements", "borrower_metadata",
        "customer_concentration", "management", "collateral_offered",
        "principals_and_owners",
    ):
        assert field in body, f"published payload missing '{field}'"
    assert body["borrower_id"] == "BRW-LECO"
    assert body["scenario_tag"] == "happy-path"
    assert body["loan_amount"] == 25_000_000
    assert body["loan_type"] == "term"
    assert body["naics_code"] == "333992"

    out = capsys.readouterr().out
    assert "published BRW-LECO" in out
    assert "msg_id=fake-msg-id-001" in out


# ---------------------------------------------------------------------------
# 3. Round-robin order is deterministic for seed=42
# ---------------------------------------------------------------------------
def test_round_robin_order_is_deterministic_for_seed_42():
    fixtures = sim.load_fixtures()
    a = sim.round_robin_order(fixtures.keys(), seed=42)
    b = sim.round_robin_order(fixtures.keys(), seed=42)
    assert a == b, "same seed must produce identical order"
    assert set(a) == EXPECTED_BORROWERS, "every borrower must appear exactly once"
    assert len(a) == 12

    # A different seed produces a different order (sanity guard against a
    # broken shuffle that returns input order).
    c = sim.round_robin_order(fixtures.keys(), seed=1234)
    assert c != a
