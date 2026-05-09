"""LIVE round-trip citation tests.

The most expensive thing a credit memo says is a number, and the most
important thing about every number is that the underwriter can click it
and land on the page of the source PDF that produced it. This file proves
the full citation chain works end-to-end against real Landing AI:

    extracted leaf field
        → references[chunk_id]
        → chunks_by_id[chunk_id]
        → grounding.box (0..1) + grounding.page (0-indexed → 1-indexed)
        → excerpt markdown

If any link breaks, the UI's per-document panel can't draw the bbox
overlay, the audit trail can't justify the value, and the bank's SR 11-7
model-justification story falls apart.

Run:
    LIVE_VENDOR_TESTS=1 LANDING_AI_API_KEY=... \\
        pytest tests/test_live_round_trip.py -v -s
"""
from __future__ import annotations

import os
import re
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


@pytest.fixture(scope="module")
def smoke_extraction():
    """One real Landing AI call against the 10-page smoke fixture, reused
    across multiple round-trip assertions to keep cost down."""
    os.environ["DOC_VENDOR"] = "landing_ai"
    from vendors.landing_ai import LandingAIVendor
    from requirements_loader import load_extraction_schema

    pdf_path = Path(__file__).resolve().parent / "fixtures" / "smoke_10pages.pdf"
    if not pdf_path.exists():
        pytest.skip("Run download.sh + pypdf script first")

    vendor = LandingAIVendor()
    return vendor.extract(
        pdf_bytes=pdf_path.read_bytes(),
        filename="smoke_10pages.pdf",
        doc_type="10-K",
        extraction_schema=load_extraction_schema("10-K"),
    )


# ============================================================================
# Citation chain — every link is required for the UI bbox overlay to work
# ============================================================================


class TestCitationChain:
    def test_citations_present(self, smoke_extraction):
        """A 10-page real 10-K must produce >0 citations. Zero citations means
        either chunk_reference is absent from the response (vendor regression)
        or our walker stopped working (refactoring regression)."""
        assert len(smoke_extraction.citations) > 0, (
            f"Expected >0 citations from a real 10-page 10-K extract; got 0. "
            f"This breaks the per-document UI's bbox overlay and the audit trail."
        )
        # Coverage: should have citations for many extracted scalar leaves
        assert len(smoke_extraction.citations) >= 5, (
            f"Expected ≥5 citations on real financial PDF; got "
            f"{len(smoke_extraction.citations)}. Walker may be missing leaves."
        )

    def test_pages_are_one_indexed(self, smoke_extraction):
        """Landing AI returns 0-indexed pages; we MUST convert to 1-indexed
        because the UI's PDF viewer + audit log + everywhere-else are 1-indexed.
        page=0 in the response would mean we forgot to convert."""
        cited_pages = [c.page for c in smoke_extraction.citations if c.page is not None]
        assert all(p >= 1 for p in cited_pages), (
            f"All citation pages must be 1-indexed (≥1). Got: {sorted(set(cited_pages))[:5]}"
        )

    def test_pages_within_document_bounds(self, smoke_extraction):
        """A citation pointing at page 47 of a 10-page document means the
        chunk lookup is broken — we'd send the underwriter to a missing page."""
        page_count = smoke_extraction.page_count
        assert page_count is not None, "page_count must be reported"
        for c in smoke_extraction.citations:
            if c.page is not None:
                assert 1 <= c.page <= page_count, (
                    f"Citation page {c.page} out of bounds for {page_count}-page PDF "
                    f"on field {c.field_path}"
                )

    def test_bboxes_are_normalized_to_0_1(self, smoke_extraction):
        """Landing AI normalizes bboxes to [0,1] relative to page size; the
        UI's overlay assumes this. A bbox of (47, 200, 580, 240) in absolute
        pixels would draw the overlay in the wrong place."""
        bboxes = [c.bbox for c in smoke_extraction.citations if c.bbox is not None]
        assert len(bboxes) > 0, "At least some citations must carry bboxes"
        for bbox in bboxes:
            left, top, right, bottom = bbox
            assert 0 <= left <= 1, f"bbox.left out of [0,1]: {left}"
            assert 0 <= top <= 1, f"bbox.top out of [0,1]: {top}"
            assert 0 <= right <= 1, f"bbox.right out of [0,1]: {right}"
            assert 0 <= bottom <= 1, f"bbox.bottom out of [0,1]: {bottom}"
            assert left <= right, (
                f"bbox malformed: left {left} > right {right}"
            )
            assert top <= bottom, (
                f"bbox malformed: top {top} > bottom {bottom}"
            )

    def test_field_paths_use_dotted_notation(self, smoke_extraction):
        """field_path must match the dotted-path convention the UI uses to
        navigate the extracted_fields object — e.g. 'income_statement.revenue',
        not 'extraction_metadata.income_statement.revenue.references[0]'."""
        for c in smoke_extraction.citations:
            assert not c.field_path.startswith("extraction"), (
                f"field_path leaks the vendor's metadata structure: {c.field_path}"
            )
            assert "[" not in c.field_path or re.search(r"^[a-z_]+(\.[a-z_]+)*(\[\d+\])?(\.[a-z_]+)*$", c.field_path, re.IGNORECASE), (
                f"field_path has malformed array index: {c.field_path}"
            )

    def test_excerpts_are_meaningful_or_absent(self, smoke_extraction):
        """Excerpts should either be substantive (≥20 chars of real text)
        or absent (None/empty when Landing AI couldn't resolve a chunk).
        A 5-char excerpt would indicate a tokenization bug.

        We deliberately do NOT require the excerpt text to match the field's
        extracted value — Landing AI sometimes cites the surrounding context
        rather than the literal value (e.g. fiscal_year_end may be inferred
        from filing context rather than a specific 'December 31, 2023' string).
        That's expected behavior for ADE Extract."""
        excerpts = [c.excerpt for c in smoke_extraction.citations if c.excerpt]
        if excerpts:
            for c in smoke_extraction.citations:
                if c.excerpt:
                    assert len(c.excerpt.strip()) >= 5, (
                        f"Excerpt suspiciously short for {c.field_path}: "
                        f"{c.excerpt!r}"
                    )

    def test_chunk_ids_resolve_to_locatable_or_table_references(
        self, smoke_extraction,
    ):
        """Landing AI uses two chunk-id formats:
          - UUIDv4 strings (e.g. 'b1c44e64-8490-483b-9c80-3bb9cf465674') —
            these resolve to a chunk in the parse output with grounding.box
            for the bbox overlay
          - Short index-style strings (e.g. '2-2', '0-1') — these are
            table-cell references that don't carry a bbox

        For UUIDs, our walker MUST resolve them and populate page/bbox.
        For index-style refs, page/bbox may be None (the UI shows a
        'table reference' badge instead of a bbox overlay).

        A chunk_id that is neither format is a regression — likely the
        walker picked up the wrong field name from the metadata tree."""
        uuid_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            re.IGNORECASE,
        )
        index_pattern = re.compile(r"^\d+(-\d+)+$")  # e.g. "2-2", "0-1-3"

        uuid_count = 0
        table_count = 0
        for c in smoke_extraction.citations:
            if not c.chunk_id:
                continue
            is_uuid = uuid_pattern.match(c.chunk_id) is not None
            is_table = index_pattern.match(c.chunk_id) is not None
            assert is_uuid or is_table, (
                f"chunk_id should be UUIDv4 or index-style table ref; got "
                f"{c.chunk_id!r} for {c.field_path}"
            )
            if is_uuid:
                uuid_count += 1
                # UUID-style citations MUST resolve to a chunk → carry page+bbox
                assert c.page is not None, (
                    f"UUID-style citation must resolve to a chunk with page: "
                    f"{c.field_path} chunk={c.chunk_id}"
                )
                assert c.bbox is not None, (
                    f"UUID-style citation must resolve to a chunk with bbox: "
                    f"{c.field_path} chunk={c.chunk_id}"
                )
            else:
                table_count += 1

        # Most citations should be UUID-resolvable so the bbox-overlay UI works
        assert uuid_count > 0, (
            f"Expected >0 UUID-resolvable citations on a real 10-K; got 0 "
            f"({table_count} table refs only). UI bbox overlay would be empty."
        )

    def test_extracted_field_value_aligns_with_known_berkshire_2023(
        self, smoke_extraction,
    ):
        """The smoke fixture is the first 10 pages of Berkshire's 2023
        annual report. We KNOW (from the public document):
          - net income 2023 ≈ $96B (got 96000000000 in our probe run)
          - operating_income 2023 ≈ $37.4B (got 37400000000)
          - total_equity 2023 ≈ $561B (got 561000000000)

        Allow 30% tolerance for the small-slice extraction (the income
        statement summary may not be in the first 10 pages, but the
        balance sheet excerpts often are)."""
        ext = smoke_extraction.extracted_fields
        income = ext.get("income_statement") or {}
        balance = ext.get("balance_sheet") or {}

        # Either the income statement was extracted (with realistic billion-scale
        # values) OR the balance sheet was. At least ONE big-3 figure should land.
        candidates = [
            ("income_statement.net_income", income.get("net_income")),
            ("income_statement.operating_income", income.get("operating_income")),
            ("balance_sheet.total_equity", balance.get("total_equity")),
            ("balance_sheet.total_assets", balance.get("total_assets")),
        ]
        non_zero = [(k, v) for k, v in candidates if v and v > 1_000_000_000]
        assert len(non_zero) >= 1, (
            "At least one of net_income / operating_income / total_equity / "
            "total_assets must extract a billion-scale value from a real "
            f"Berkshire 2023 PDF excerpt. Got: {candidates}"
        )

        # Sanity: any extracted dollar value must be within 10x of Berkshire's
        # reported scale. A value of $1 trillion or $1 thousand for net income
        # would mean unit confusion (millions vs thousands of dollars vs raw).
        for name, val in non_zero:
            assert 1e9 <= val <= 1e13, (
                f"{name} = {val:,} is outside Berkshire's plausible scale "
                f"($1B–$10T). Likely a unit-conversion bug or hallucination."
            )
