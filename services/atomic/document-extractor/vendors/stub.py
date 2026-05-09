"""Stub vendor — DETERMINISTIC fixture-driven responses for unit tests.

Used in tests/test_*.py via DOC_VENDOR=stub so we can assert the
dispatcher's behavior without hitting any real API. Per Rule 3 of
product-build-discipline (no silent stubs in production), this vendor's
.name is "stub" and the smoke gate fails if any agent_action / extraction
event records vendor=stub in production.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .types import VendorCitation, VendorResult


class StubVendor:
    name = "stub"

    def __init__(self) -> None:
        # Stub responses keyed by doc_type live at tests/golden/<doc_type>.json
        # Tests can override via STUB_FIXTURES_DIR env var.
        fixtures_dir = os.environ.get("STUB_FIXTURES_DIR")
        if fixtures_dir:
            self._dir = Path(fixtures_dir)
        else:
            self._dir = Path(__file__).resolve().parent.parent / "tests" / "golden"

    def health_check(self) -> bool:
        return True

    def extract(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        doc_type: str,
        extraction_schema: dict[str, Any],
    ) -> VendorResult:
        path = self._dir / f"{doc_type}.stub.json"
        if not path.exists():
            # Tests that exercise unknown doc_types should explicitly
            # provide a fixture; otherwise produce empty success
            return VendorResult(
                extracted_fields={},
                confidence=0.5,
                vendor_model="stub",
            )
        data = json.loads(path.read_text(encoding="utf-8"))
        citations = [
            VendorCitation(**c) if isinstance(c, dict) else c
            for c in data.get("citations", [])
        ]
        return VendorResult(
            extracted_fields=data.get("extracted_fields", {}),
            citations=citations,
            confidence=float(data.get("confidence", 0.9)),
            page_count=data.get("page_count"),
            vendor_model="stub",
            credit_usage_units=0.0,
            estimated_cost_usd=0.0,
            warnings=data.get("warnings", []),
            raw_markdown=data.get("raw_markdown"),
        )
