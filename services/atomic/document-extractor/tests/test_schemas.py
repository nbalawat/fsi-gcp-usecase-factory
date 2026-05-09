"""Quality gate 1 — Pydantic schema at every boundary.

Every payload entering / leaving the service is Pydantic-validated. Any
malformed input is rejected with HTTP 422 BEFORE we touch a vendor API.
This prevents wasted credit spend on garbage input.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas import (
    ExtractRequest,
    ExtractResponse,
    Citation,
    VendorWarning,
)


class TestExtractRequest:
    """Boundary contract for POST /extract input."""

    def test_valid_request_accepted(self, sample_extract_request_10k):
        req = ExtractRequest.model_validate(sample_extract_request_10k)
        assert req.doc_type == "10-K"
        assert req.gcs_uri.startswith("gs://")

    def test_unknown_doc_type_rejected(self, sample_extract_request_10k):
        bad = dict(sample_extract_request_10k, doc_type="profit_and_loss")
        with pytest.raises(ValidationError) as exc_info:
            ExtractRequest.model_validate(bad)
        assert "doc_type" in str(exc_info.value)

    def test_non_gcs_uri_rejected(self, sample_extract_request_10k):
        bad = dict(sample_extract_request_10k, gcs_uri="https://example.com/x.pdf")
        with pytest.raises(ValidationError):
            ExtractRequest.model_validate(bad)

    def test_uri_must_be_pdf(self, sample_extract_request_10k):
        bad = dict(sample_extract_request_10k, gcs_uri="gs://bucket/x.docx")
        with pytest.raises(ValidationError):
            ExtractRequest.model_validate(bad)

    def test_short_uuid_rejected(self, sample_extract_request_10k):
        bad = dict(sample_extract_request_10k, application_id="too-short")
        with pytest.raises(ValidationError):
            ExtractRequest.model_validate(bad)

    def test_extra_fields_forbidden(self, sample_extract_request_10k):
        bad = dict(sample_extract_request_10k, extra_field="should fail")
        with pytest.raises(ValidationError):
            ExtractRequest.model_validate(bad)

    def test_vendor_override_only_known_values(self, sample_extract_request_10k):
        ok = dict(sample_extract_request_10k, vendor_override="liteparse_gemini")
        ExtractRequest.model_validate(ok)

        bad = dict(sample_extract_request_10k, vendor_override="aws_textract")
        with pytest.raises(ValidationError):
            ExtractRequest.model_validate(bad)


class TestExtractResponse:
    """Boundary contract for POST /extract output."""

    def _minimal_payload(self) -> dict:
        return {
            "doc_id": "22222222-2222-2222-2222-222222222222",
            "doc_type": "10-K",
            "application_id": "11111111-1111-1111-1111-111111111111",
            "extracted_fields": {},
            "missing_required_fields": [],
            "missing_preferred_fields": [],
            "citations": [],
            "confidence": 0.9,
            "vendor": "landing_ai",
            "credit_usage_units": 5.0,
            "estimated_cost_usd": 0.005,
            "latency_ms": 14000,
            "warnings": [],
        }

    def test_minimal_response_validates(self):
        ExtractResponse.model_validate(self._minimal_payload())

    def test_confidence_bounded(self):
        bad = self._minimal_payload()
        bad["confidence"] = 1.5
        with pytest.raises(ValidationError):
            ExtractResponse.model_validate(bad)

    def test_negative_latency_rejected(self):
        bad = self._minimal_payload()
        bad["latency_ms"] = -1
        with pytest.raises(ValidationError):
            ExtractResponse.model_validate(bad)

    def test_unknown_vendor_rejected(self):
        bad = self._minimal_payload()
        bad["vendor"] = "made_up_vendor"
        with pytest.raises(ValidationError):
            ExtractResponse.model_validate(bad)

    def test_failure_response_shape(self):
        """Failures still validate; extracted_fields = {} is OK."""
        payload = self._minimal_payload() | {
            "failed": True,
            "error_code": "vendor_timeout",
            "error_message": "Landing AI ADE Parse timed out after 120s",
            "confidence": 0.0,
            "missing_required_fields": ["income_statement.revenue", "balance_sheet.total_assets"],
        }
        resp = ExtractResponse.model_validate(payload)
        assert resp.failed is True
        assert resp.error_code == "vendor_timeout"


class TestCitation:
    def test_bbox_is_4_floats(self):
        Citation.model_validate({
            "field_path": "income_statement.revenue",
            "page": 18,
            "bbox": [0.1, 0.2, 0.6, 0.3],
        })

    def test_bbox_wrong_length_rejected(self):
        with pytest.raises(ValidationError):
            Citation.model_validate({
                "field_path": "income_statement.revenue",
                "page": 18,
                "bbox": [0.1, 0.2, 0.6],  # only 3
            })

    def test_excerpt_truncation(self):
        with pytest.raises(ValidationError):
            Citation.model_validate({
                "field_path": "income_statement.revenue",
                "excerpt": "x" * 600,  # exceeds 500
            })


class TestVendorWarning:
    def test_unknown_warning_code_rejected(self):
        with pytest.raises(ValidationError):
            VendorWarning.model_validate({"code": "made_up_code", "msg": "nope"})

    def test_known_warning_codes_accepted(self):
        for code in [
            "nonconformant_schema",
            "nonconformant_output",
            "low_confidence",
            "ocr_required",
            "page_failure",
            "rate_limited",
            "vendor_fallback_used",
        ]:
            VendorWarning.model_validate({"code": code, "msg": "test"})
