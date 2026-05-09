"""LIVE cost + latency budget tests.

Hits Landing AI with the small_valid_financial.pdf fixture (30 pages,
~451KB) and asserts the per-doc cost stays under the budget recorded in
manifest.json's `production_gates`. A regression here means we silently
ship a 5x cost spike to production.

Budgets (also in manifest.json):
  - cost_target_per_doc_usd: $0.50
  - cost_budget_per_call_usd (hard ceiling): $1.00
  - latency_target_per_page_ms: 6,500
  - latency_p99_ms: 300,000

Run:
    LIVE_VENDOR_TESTS=1 LANDING_AI_API_KEY=... \\
        pytest tests/test_live_cost_and_latency.py -v -s

Cost: ~$0.10 per full pass.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import pytest


LIVE_ENABLED = (
    os.environ.get("LIVE_VENDOR_TESTS") == "1"
    and os.environ.get("LANDING_AI_API_KEY")
)

pytestmark = pytest.mark.skipif(
    not LIVE_ENABLED,
    reason="Set LIVE_VENDOR_TESTS=1 + LANDING_AI_API_KEY to run live tests",
)


def _load_manifest_budgets() -> dict:
    """Read the budgets from manifest.json — single source of truth."""
    manifest_path = Path(__file__).resolve().parent.parent / "manifest.json"
    return json.loads(manifest_path.read_text())["production_gates"]


@pytest.fixture(scope="module")
def small_extraction():
    """One real Landing AI call against the 30-page small_valid fixture."""
    os.environ["DOC_VENDOR"] = "landing_ai"
    from vendors.landing_ai import LandingAIVendor
    from requirements_loader import load_extraction_schema

    pdf_path = Path(__file__).resolve().parent / "fixtures" / "small_valid_financial.pdf"
    if not pdf_path.exists():
        pytest.skip("Run download.sh + pypdf script first")

    vendor = LandingAIVendor()

    t0 = time.monotonic()
    result = vendor.extract(
        pdf_bytes=pdf_path.read_bytes(),
        filename="small_valid_financial.pdf",
        doc_type="10-K",
        extraction_schema=load_extraction_schema("10-K"),
    )
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    return result, elapsed_ms


# ============================================================================
# Cost budget
# ============================================================================


class TestCostBudget:
    def test_per_doc_cost_under_target(self, small_extraction):
        result, _ = small_extraction
        budgets = _load_manifest_budgets()
        target = budgets["cost_target_per_doc_usd"]

        assert result.estimated_cost_usd < target, (
            f"Real 30-page extract cost ${result.estimated_cost_usd:.4f} "
            f"exceeds target ${target}/doc. Investigate before shipping; "
            f"this scales to ${result.estimated_cost_usd * 100:.2f} per 100 docs."
        )

    def test_per_doc_cost_under_hard_ceiling(self, small_extraction):
        result, _ = small_extraction
        budgets = _load_manifest_budgets()
        ceiling = budgets["cost_budget_per_call_usd"]

        assert result.estimated_cost_usd < ceiling, (
            f"Real 30-page extract cost ${result.estimated_cost_usd:.4f} "
            f"exceeds the HARD ceiling of ${ceiling}/call. Build must fail."
        )

    def test_credit_usage_reported(self, small_extraction):
        """Landing AI must report credit_usage on every call. Zero credits
        means we either hit a stub OR the API changed and our parser is
        looking at the wrong field."""
        result, _ = small_extraction
        assert result.credit_usage_units > 0, (
            f"Real call must report >0 credit_usage_units; got "
            f"{result.credit_usage_units}. Either the API response shape "
            f"changed or we're hitting a stub."
        )

    def test_cost_scales_roughly_with_pages(self, small_extraction):
        """Sanity: 30-page doc should cost roughly 3x the 10-page smoke
        fixture. This catches a class of bug where credits are double-
        counted or where the wrong page count is reported."""
        result, _ = small_extraction
        # Smoke (10pp) measured at ~$0.036 in probe; 30pp should be in
        # $0.05 .. $0.30 range. This is a wide band on purpose.
        assert 0.02 < result.estimated_cost_usd < 0.40, (
            f"30-page cost ${result.estimated_cost_usd:.4f} is outside the "
            f"plausible band $0.02–$0.40 (smoke 10pp ≈ $0.036). "
            f"Investigate cost / page-count reporting."
        )


# ============================================================================
# Latency budget
# ============================================================================


class TestLatencyBudget:
    def test_per_call_latency_under_p99(self, small_extraction):
        _, elapsed_ms = small_extraction
        budgets = _load_manifest_budgets()
        p99 = budgets["latency_p99_ms"]

        assert elapsed_ms < p99, (
            f"30-page extract took {elapsed_ms}ms; exceeds p99 budget {p99}ms. "
            f"Cloud Run timeout (Rule 21) must be sized larger if this is real."
        )

    def test_per_page_latency_within_target(self, small_extraction):
        result, elapsed_ms = small_extraction
        budgets = _load_manifest_budgets()
        target_per_page = budgets["latency_target_per_page_ms"]

        if not result.page_count:
            pytest.fail("Vendor must report page_count for latency budget calc")

        per_page_ms = elapsed_ms / result.page_count
        # Allow 4x the per-page target for the smaller doc — short docs
        # have fixed overhead from the parse-stage cold start. The p99 budget
        # above is the real ceiling.
        assert per_page_ms < target_per_page * 4, (
            f"Per-page latency {per_page_ms:.0f}ms exceeds target_per_page "
            f"{target_per_page}ms x 4. Check for parse-stage regression."
        )

    def test_latency_reported_in_seconds_range(self, small_extraction):
        """Real Landing AI calls take 30-300s for typical PDFs. A latency
        of 5ms means we hit a stub; >600s means we should bump the timeout
        rather than letting Cloud Run kill the request mid-flight."""
        _, elapsed_ms = small_extraction
        assert 5_000 < elapsed_ms < 600_000, (
            f"Latency {elapsed_ms}ms is outside the plausible band "
            f"(5s..600s). Likely either a stub or a hung request."
        )


# ============================================================================
# Vendor model + warning capture
# ============================================================================


class TestVendorMetadata:
    def test_vendor_model_present(self, small_extraction):
        """Without a vendor_model string, the audit row can't record which
        Landing AI version produced the extraction — breaks SR 11-7
        model-versioning requirements."""
        result, _ = small_extraction
        assert result.vendor_model is not None, "vendor_model must be reported"
        # Landing AI versions look like 'extract-20260314' or 'dpt-2-20260410'
        assert re.match(r"^[a-z]+(-[a-z0-9]+)*-?\d*$", result.vendor_model), (
            f"vendor_model {result.vendor_model!r} doesn't match Landing AI's "
            f"version-string pattern; vendor may have changed schema"
        )

    def test_warnings_are_well_formed(self, small_extraction):
        """If warnings exist (often — schema-drift warnings are common),
        each must have a code + msg so dashboards can group them."""
        result, _ = small_extraction
        for w in result.warnings:
            assert w.get("code"), f"warning missing code: {w}"
            assert w.get("msg"), f"warning missing msg: {w}"


# ============================================================================
# Print measurements for the manifest update
# ============================================================================


def test_print_measurements_for_manifest(small_extraction):
    """Not really a test — emits the measurements to stdout so the next
    run of `pytest -s` shows what to update in manifest.json's
    `production_gates.measurements`."""
    result, elapsed_ms = small_extraction
    pages = result.page_count or 0
    per_page_ms = (elapsed_ms / pages) if pages else 0
    per_page_cost = (result.estimated_cost_usd / pages) if pages else 0

    print("\n══════════════════════════════════════════════════════════════")
    print("  Landing AI cost+latency measurements (small_valid_financial.pdf)")
    print("══════════════════════════════════════════════════════════════")
    print(f"  pages              : {pages}")
    print(f"  total elapsed (ms) : {elapsed_ms:,}")
    print(f"  per-page (ms)      : {per_page_ms:.0f}")
    print(f"  total cost (USD)   : ${result.estimated_cost_usd:.4f}")
    print(f"  per-page cost      : ${per_page_cost:.6f}")
    print(f"  credits used       : {result.credit_usage_units:.2f}")
    print(f"  vendor model       : {result.vendor_model}")
    print(f"  citations          : {len(result.citations)}")
    print(f"  warnings           : {len(result.warnings)}")
    print("══════════════════════════════════════════════════════════════\n")
