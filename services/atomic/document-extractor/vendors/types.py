"""Shared types across vendor implementations."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class VendorCitation:
    """One field → source-region citation."""
    field_path: str
    chunk_id: str | None = None
    page: int | None = None
    bbox: tuple[float, float, float, float] | None = None
    excerpt: str | None = None
    confidence: float | None = None


@dataclass
class VendorResult:
    """What every vendor returns to the orchestrator-side dispatcher.

    Note: extracted_fields is a free-form dict (vendor-shaped, validated
    against the doc-type extraction schema separately). All other fields
    are normalized across vendors.
    """
    extracted_fields: dict[str, Any]
    citations: list[VendorCitation] = field(default_factory=list)
    confidence: float = 0.0
    page_count: int | None = None
    vendor_model: str | None = None
    credit_usage_units: float = 0.0
    estimated_cost_usd: float = 0.0
    warnings: list[dict[str, Any]] = field(default_factory=list)
    raw_markdown: str | None = None
    """Optional — the parsed-document markdown the vendor produced.
    Stored to GCS for debugging; not part of the extracted_fields contract."""
