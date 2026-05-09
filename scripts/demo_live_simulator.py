#!/usr/bin/env python3
"""demo_live_simulator.py — feed the credit-memo demo pipeline with synthetic events.

Continuously publishes synthetic loan-application events to the deployed
`loans.application.submitted` Pub/Sub topic so the demo UI shows applications
arriving and being processed in real time.

The 12 borrower fixtures live as JSON files under ``scripts/demo_fixtures/``.
At startup we read ``borrower_master`` from Cloud SQL (if reachable) to
hydrate the ``borrower_name`` field for each fixture; if the DB is not
reachable we fall back to the ``legal_name`` already stored in the fixture.

Usage:

    python scripts/demo_live_simulator.py \
        --cadence-seconds 60 \
        --duration-minutes 20 \
        --project agentic-experiments \
        --topic loans.application.submitted \
        --seed 42

    # Single-shot (used by unit tests):
    python scripts/demo_live_simulator.py --once

    # Pin a specific borrower:
    python scripts/demo_live_simulator.py --once --borrower BRW-LECO

Authentication: standard Google ADC. Either run
``gcloud auth application-default login`` or set
``GOOGLE_APPLICATION_CREDENTIALS`` to a service-account key file path.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

logger = logging.getLogger("demo_live_simulator")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FIXTURE_DIR = Path(__file__).resolve().parent / "demo_fixtures"
DEFAULT_PROJECT = "agentic-experiments"
DEFAULT_TOPIC = "loans.application.submitted"
DEFAULT_CADENCE_SECONDS = 60
DEFAULT_DURATION_MINUTES = 20
DEFAULT_SEED = 42

# Fields every fixture must have (used by both the simulator and the unit test).
REQUIRED_TOP_LEVEL = {
    "borrower_id",
    "scenario_tag",
    "loan_request",
    "financial_statements",
    "borrower_metadata",
    "customer_concentration",
    "management",
    "collateral_offered",
    "principals_and_owners",
}

ALLOWED_SCENARIO_TAGS = {
    "happy-path",
    "concentration-near-limit",
    "covenant-headroom-thin",
    "insider-flag",
    "weak-coverage",
    "real-estate-secured",
    "acquisition-pending",
    "cre-concentration-warning",
    "regulatory-clock-tight",
    "customer-concentration-substandard",
    "management-continuity-weak",
    "pricing-outlier",
}


# ---------------------------------------------------------------------------
# Fixture loading + validation
# ---------------------------------------------------------------------------
def load_fixtures(fixture_dir: Path = FIXTURE_DIR) -> dict[str, dict[str, Any]]:
    """Load all 12 fixture JSON files; return ``{borrower_id: payload}``."""
    if not fixture_dir.is_dir():
        raise FileNotFoundError(f"fixture directory not found: {fixture_dir}")

    fixtures: dict[str, dict[str, Any]] = {}
    for path in sorted(fixture_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            raise ValueError(f"fixture {path.name} is not valid JSON: {exc}") from exc
        validate_fixture(payload, path.name)
        fixtures[payload["borrower_id"]] = payload
    if not fixtures:
        raise RuntimeError(f"no fixtures found in {fixture_dir}")
    return fixtures


def validate_fixture(payload: dict[str, Any], source: str) -> None:
    """Raise ValueError if ``payload`` does not satisfy schema + ratio invariants."""
    missing = REQUIRED_TOP_LEVEL - set(payload.keys())
    if missing:
        raise ValueError(f"{source}: missing required fields {sorted(missing)}")

    tag = payload["scenario_tag"]
    if tag not in ALLOWED_SCENARIO_TAGS:
        raise ValueError(f"{source}: scenario_tag '{tag}' not in allowed set")

    # ---- loan_request -------------------------------------------------------
    lr = payload["loan_request"]
    for field in ("amount_usd", "term_years", "facility_type", "purpose"):
        if field not in lr:
            raise ValueError(f"{source}: loan_request missing '{field}'")
    if not (0 < lr["amount_usd"] <= 1_000_000_000):
        raise ValueError(f"{source}: loan_request.amount_usd out of range")
    if not (0 < lr["term_years"] <= 30):
        raise ValueError(f"{source}: loan_request.term_years out of range")

    # ---- financial_statements ----------------------------------------------
    fs = payload["financial_statements"]
    for section in ("income_statement", "balance_sheet", "cash_flow"):
        if section not in fs:
            raise ValueError(f"{source}: financial_statements missing '{section}'")
    if "fy2025" not in fs["income_statement"]:
        raise ValueError(f"{source}: income_statement requires fy2025")
    inc = fs["income_statement"]["fy2025"]
    bs = fs["balance_sheet"]["fy2025"]

    # ---- ratio sanity: leverage and DSCR derivable + reasonable -----------
    if inc["ebitda"] <= 0:
        raise ValueError(f"{source}: ebitda must be positive")
    leverage = bs["total_debt"] / inc["ebitda"]
    if leverage < 0 or leverage > 10:
        raise ValueError(f"{source}: implied leverage {leverage:.2f}x out of range")

    annual_principal = lr["amount_usd"] / lr["term_years"]
    debt_service = annual_principal + inc["interest_expense"]
    if debt_service <= 0:
        raise ValueError(f"{source}: implied debt service must be positive")
    dscr = inc["ebitda"] / debt_service
    if dscr <= 0 or dscr > 100:
        raise ValueError(f"{source}: implied DSCR {dscr:.2f} out of range")

    # ---- balance-sheet identity (loose, +/- 5%) ----------------------------
    # total_assets ~= total_debt + total_equity + other_liabilities (allowed gap)
    asset_floor = bs["total_debt"] + bs["total_equity"]
    if bs["total_assets"] < asset_floor * 0.85:
        raise ValueError(
            f"{source}: total_assets {bs['total_assets']} < debt+equity "
            f"{asset_floor} (balance-sheet inconsistency)"
        )

    # ---- customer concentration --------------------------------------------
    cc = payload["customer_concentration"]
    top5 = cc["top_5_pct"]
    if not isinstance(top5, list) or len(top5) != 5:
        raise ValueError(f"{source}: customer_concentration.top_5_pct must be a length-5 list")
    if sum(top5) > 1.0001:
        raise ValueError(f"{source}: top_5_pct sums to {sum(top5):.3f} > 1.0")
    if abs(cc["top_1_pct"] - top5[0]) > 1e-6:
        raise ValueError(f"{source}: top_1_pct must equal top_5_pct[0]")

    # ---- management --------------------------------------------------------
    mgmt = payload["management"]
    for f in ("ceo_name", "cfo_name", "ceo_tenure_years",
              "cfo_tenure_years", "cfo_external_hire"):
        if f not in mgmt:
            raise ValueError(f"{source}: management missing '{f}'")

    # ---- collateral --------------------------------------------------------
    if not payload["collateral_offered"]:
        raise ValueError(f"{source}: collateral_offered cannot be empty")
    for col in payload["collateral_offered"]:
        for f in ("type", "estimated_value_usd", "age_years", "condition"):
            if f not in col:
                raise ValueError(f"{source}: collateral missing '{f}'")

    # ---- principals --------------------------------------------------------
    if not payload["principals_and_owners"]:
        raise ValueError(f"{source}: principals_and_owners cannot be empty")
    for p in payload["principals_and_owners"]:
        for f in ("name", "stake_pct", "role", "is_director"):
            if f not in p:
                raise ValueError(f"{source}: principal entry missing '{f}'")


# ---------------------------------------------------------------------------
# Borrower-master enrichment (Cloud SQL — best effort; fall back to fixture)
# ---------------------------------------------------------------------------
def fetch_borrower_master(database_url: Optional[str]) -> dict[str, dict[str, Any]]:
    """Read borrower_master rows. Returns ``{}`` if DB is unreachable.

    Resolves a single SQL query: SELECT borrower_id, legal_name, naics_code,
    primary_state, risk_rating FROM borrower_master.
    """
    if not database_url:
        return {}
    try:
        import psycopg  # type: ignore  # psycopg3
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore
        except ImportError:
            logger.warning("no psycopg driver installed; skipping DB borrower-master read")
            return {}
    try:
        conn = psycopg.connect(database_url)
    except Exception as exc:  # broad catch: DB optional
        logger.warning("could not connect to borrower-master DB (%s); using fixture names", exc)
        return {}
    rows: dict[str, dict[str, Any]] = {}
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT borrower_id, legal_name, naics_code, primary_state, risk_rating "
                "FROM borrower_master"
            )
            for borrower_id, legal_name, naics, state, rating in cur.fetchall():
                rows[borrower_id] = {
                    "borrower_id": borrower_id,
                    "legal_name": legal_name,
                    "naics_code": naics,
                    "primary_state": state,
                    "risk_rating": rating,
                }
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return rows


# ---------------------------------------------------------------------------
# Event construction + publishing
# ---------------------------------------------------------------------------
def _new_application_id() -> str:
    """Prefer uuid7 (time-ordered) when available; fall back to uuid4."""
    fn = getattr(uuid, "uuid7", None)
    if callable(fn):
        return str(fn())
    return str(uuid.uuid4())


def build_event(
    fixture: dict[str, Any],
    *,
    borrower_master: dict[str, dict[str, Any]],
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Assemble the Pub/Sub message body for one fixture."""
    now = now or datetime.now(timezone.utc)
    bid = fixture["borrower_id"]
    bm = borrower_master.get(bid, {})
    borrower_name = bm.get("legal_name") or fixture["borrower_metadata"]["legal_name"]
    naics = bm.get("naics_code") or fixture["borrower_metadata"]["naics_code"]

    return {
        # ---- handler-required identity fields ----
        "application_id": _new_application_id(),
        "borrower_id": bid,
        "borrower_name": borrower_name,
        "loan_amount": fixture["loan_request"]["amount_usd"],
        "loan_type": fixture["loan_request"]["facility_type"],
        "naics_code": naics,
        "submitted_at": now.strftime("%Y-%m-%dT%H:%M:%S.")
        + f"{now.microsecond // 1000:03d}Z",
        # ---- demo-driver tag (drives downstream rule paths) ----
        "scenario_tag": fixture["scenario_tag"],
        # ---- full fixture passthrough ----
        "loan_request": fixture["loan_request"],
        "financial_statements": fixture["financial_statements"],
        "borrower_metadata": fixture["borrower_metadata"],
        "customer_concentration": fixture["customer_concentration"],
        "management": fixture["management"],
        "collateral_offered": fixture["collateral_offered"],
        "principals_and_owners": fixture["principals_and_owners"],
    }


def round_robin_order(borrower_ids: Iterable[str], seed: int) -> list[str]:
    """Deterministic shuffled order — same seed yields same order."""
    rng = random.Random(seed)
    order = list(borrower_ids)
    rng.shuffle(order)
    return order


def _build_publisher():
    """Lazily import google-cloud-pubsub so unit tests can mock it cleanly."""
    from google.cloud import pubsub_v1  # type: ignore
    return pubsub_v1.PublisherClient()


def publish_event(
    publisher,
    topic_path: str,
    event: dict[str, Any],
    *,
    timeout: float = 10.0,
) -> str:
    """Publish one event; return the Pub/Sub message id."""
    data = json.dumps(event).encode("utf-8")
    future = publisher.publish(
        topic_path,
        data=data,
        event_type="loans.application.submitted",
        scenario_tag=event["scenario_tag"],
        borrower_id=event["borrower_id"],
    )
    return future.result(timeout=timeout)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def run(
    *,
    cadence_seconds: int,
    duration_minutes: int,
    project: str,
    topic: str,
    seed: int,
    once: bool,
    borrower: Optional[str],
    publisher=None,
    fixtures: Optional[dict[str, dict[str, Any]]] = None,
    borrower_master: Optional[dict[str, dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Run the simulator loop and return summary stats."""
    fixtures = fixtures if fixtures is not None else load_fixtures()
    logger.info("loaded %d fixtures", len(fixtures))

    if borrower_master is None:
        borrower_master = fetch_borrower_master(os.environ.get("DATABASE_URL"))

    if borrower is not None and borrower not in fixtures:
        raise SystemExit(f"--borrower {borrower!r} not in fixtures: {sorted(fixtures)}")

    order = (
        [borrower] if borrower is not None
        else round_robin_order(fixtures.keys(), seed=seed)
    )

    if publisher is None:
        publisher = _build_publisher()
    topic_path = publisher.topic_path(project, topic)

    deadline = time.monotonic() + duration_minutes * 60
    published = 0
    seen: set[str] = set()
    idx = 0

    while True:
        bid = order[idx % len(order)]
        idx += 1
        fixture = fixtures[bid]
        event = build_event(fixture, borrower_master=borrower_master)

        try:
            msg_id = publish_event(publisher, topic_path, event)
        except Exception as exc:
            logger.error("publish failed for %s: %s", bid, exc)
            if once:
                raise
            time.sleep(min(cadence_seconds, 5))
            continue

        published += 1
        seen.add(bid)
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(
            f"[{ts}] published {bid:14s} application_id={event['application_id']} "
            f"scenario={event['scenario_tag']} msg_id={msg_id}",
            flush=True,
        )

        if once:
            break
        if time.monotonic() >= deadline:
            break
        time.sleep(cadence_seconds)

    print(f"published {published} events across {len(seen)} borrowers", flush=True)
    return {"published": published, "borrowers": sorted(seen)}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    p.add_argument("--cadence-seconds", type=int, default=DEFAULT_CADENCE_SECONDS)
    p.add_argument("--duration-minutes", type=int, default=DEFAULT_DURATION_MINUTES)
    p.add_argument("--project", default=DEFAULT_PROJECT)
    p.add_argument("--topic", default=DEFAULT_TOPIC)
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--once", action="store_true",
                   help="publish exactly one event and exit (for unit tests)")
    p.add_argument("--borrower", default=None,
                   help="publish for a specific borrower (overrides random pick)")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = parse_args(argv)
    run(
        cadence_seconds=args.cadence_seconds,
        duration_minutes=args.duration_minutes,
        project=args.project,
        topic=args.topic,
        seed=args.seed,
        once=args.once,
        borrower=args.borrower,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
