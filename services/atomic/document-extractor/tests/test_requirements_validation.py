"""Tests for requirements_loader: missing-field detection logic.

This is the validation engine that drives the return-for-revision flow.
A bug here means deficient applications pass through OR clean
applications get rejected. Both are bad.
"""
from __future__ import annotations

import pytest

from requirements_loader import (
    find_missing_fields,
    load_document_requirements,
    load_extraction_schema,
    preferred_field_paths,
    required_field_paths,
)


class TestRequirementsLoading:
    def test_document_requirements_loads(self):
        req = load_document_requirements()
        assert "doc_types" in req
        assert "10-K" in req["doc_types"]
        assert "audited_financials" in req["doc_types"]

    def test_each_doc_type_has_extraction_schema(self):
        req = load_document_requirements()
        for doc_type in req["doc_types"]:
            schema = load_extraction_schema(doc_type)
            assert schema["type"] == "object"

    def test_application_completeness_tiers_present(self):
        req = load_document_requirements()
        assert "application_completeness" in req
        tiers = req["application_completeness"]["tiers_by_loan_amount"]
        assert any(t.get("loan_amount_lt") == 10_000_000 for t in tiers)
        assert any(t.get("loan_amount_lt") >= 200_000_000 for t in tiers)


class TestRequiredFields:
    def test_10k_required_fields_include_revenue(self):
        paths = required_field_paths("10-K")
        assert "income_statement.revenue" in paths
        assert "balance_sheet.total_assets" in paths
        assert "fiscal_year_end" in paths

    def test_unknown_doc_type_raises(self):
        with pytest.raises(KeyError):
            required_field_paths("not-a-doc-type")

    def test_preferred_fields_distinct_from_required(self):
        req_paths = set(required_field_paths("10-K"))
        pref_paths = set(preferred_field_paths("10-K"))
        # No overlap — preferred is stuff "we'd like" beyond required
        assert not (req_paths & pref_paths), \
            f"required + preferred must be disjoint; overlap: {req_paths & pref_paths}"


class TestFindMissingFields:
    """The cross-check that drives missing_required_fields in the response."""

    def test_all_present_returns_empty(self):
        extracted = {
            "fiscal_year_end": "2024-12-31",
            "income_statement": {"revenue": 100, "ebitda": 25},
            "balance_sheet": {"total_assets": 500},
        }
        paths = ["fiscal_year_end", "income_statement.revenue", "balance_sheet.total_assets"]
        assert find_missing_fields(extracted, paths) == []

    def test_null_value_counts_as_missing(self):
        extracted = {"income_statement": {"revenue": None, "ebitda": 25}}
        missing = find_missing_fields(extracted, ["income_statement.revenue", "income_statement.ebitda"])
        assert "income_statement.revenue" in missing
        assert "income_statement.ebitda" not in missing

    def test_empty_string_counts_as_missing(self):
        extracted = {"fiscal_year_end": ""}
        assert "fiscal_year_end" in find_missing_fields(extracted, ["fiscal_year_end"])

    def test_empty_dict_counts_as_missing(self):
        extracted = {"income_statement": {}}
        assert "income_statement" in find_missing_fields(extracted, ["income_statement"])

    def test_empty_list_counts_as_missing(self):
        extracted = {"customers": []}
        assert "customers" in find_missing_fields(extracted, ["customers"])

    def test_zero_is_NOT_missing(self):
        """0 is a valid extracted value; many financial fields legitimately
        have 0 (e.g. no debt, no capex)."""
        extracted = {"balance_sheet": {"total_debt": 0, "long_term_debt": 0.0}}
        missing = find_missing_fields(
            extracted, ["balance_sheet.total_debt", "balance_sheet.long_term_debt"]
        )
        assert missing == [], "0 must be treated as a real value"

    def test_nested_missing_path_returns_path(self):
        extracted = {"income_statement": {}}
        assert "income_statement.revenue" in find_missing_fields(
            extracted, ["income_statement.revenue"]
        )

    def test_deeply_missing_branch(self):
        extracted = {"fiscal_year_end": "2024-12-31"}
        # Whole branch missing
        missing = find_missing_fields(
            extracted, ["balance_sheet.total_assets", "balance_sheet.total_debt"]
        )
        assert missing == ["balance_sheet.total_assets", "balance_sheet.total_debt"]
