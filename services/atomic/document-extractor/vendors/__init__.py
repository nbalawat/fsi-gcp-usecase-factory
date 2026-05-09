"""Vendor abstraction layer.

Public API:
    get_vendor(name: VendorName) -> _DocumentVendor

Each vendor implements:
    extract(pdf_bytes, doc_type, extraction_schema) -> VendorResult

Adding a new vendor (e.g. AWS Textract):
    1. Drop a new module here
    2. Implement _DocumentVendor protocol
    3. Register in get_vendor()
    4. Add an entry in tests/test_failure_modes.py for vendor-specific failures
"""
from __future__ import annotations

import os
from typing import Protocol

from .types import VendorResult


class _DocumentVendor(Protocol):
    name: str
    """Stable identifier for audit trails (matches schemas.VendorName)."""

    def health_check(self) -> bool:
        """Returns True if the vendor's API is reachable + credentials valid."""
        ...

    def extract(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        doc_type: str,
        extraction_schema: dict,
    ) -> VendorResult:
        """End-to-end: parse + extract one PDF with the doc-type-specific schema."""
        ...


def get_vendor(name: str | None = None) -> _DocumentVendor:
    """Resolve a vendor by name with env-var override.

    Order of precedence:
        1. Explicit `name` argument
        2. DOC_VENDOR env var
        3. Default: 'landing_ai'
    """
    resolved = name or os.environ.get("DOC_VENDOR") or "landing_ai"

    if resolved == "landing_ai":
        from .landing_ai import LandingAIVendor
        return LandingAIVendor()
    if resolved == "liteparse_gemini":
        from .liteparse_gemini import LiteParseGeminiVendor
        return LiteParseGeminiVendor()
    if resolved == "stub":
        from .stub import StubVendor
        return StubVendor()

    raise ValueError(f"Unknown DOC_VENDOR={resolved!r}. Valid: landing_ai, liteparse_gemini, stub")
