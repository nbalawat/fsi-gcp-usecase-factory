"""Pydantic schemas for the document-extractor service.

These are the I/O contracts at every boundary. Any payload that doesn't
validate is rejected with HTTP 422 BEFORE we touch a vendor API; that
prevents wasted credit-spend on malformed inputs.

The internal dataclasses (Citation, ExtractedFields, etc.) are also the
schema the vendor implementations must emit — so the vendor abstraction
is type-safe end-to-end.
"""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict


DocType = Literal[
    "10-K",
    "10-Q",
    "audited_financials",
    "AR_aging",
    "board_minutes",
    "appraisal",
    "business_plan",
]

VendorName = Literal["landing_ai", "liteparse_gemini", "stub", "unknown"]
"""'unknown' is reserved for failure paths where no vendor was actually
called (e.g. GCS download failed before vendor dispatch). The smoke
test fails if vendor='unknown' appears on a successful (failed=False)
extraction — Rule 3 of product-build-discipline."""


class ExtractRequest(BaseModel):
    """POST /extract input."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    application_id: str = Field(..., description="UUID of the application", min_length=36, max_length=36)
    doc_id: str = Field(..., description="UUID of this document", min_length=36, max_length=36)
    doc_type: DocType
    gcs_uri: str = Field(..., pattern=r"^gs://[a-z0-9._-]+/.+\.pdf$")
    vendor_override: VendorName | None = Field(
        default=None,
        description="Force a specific vendor; defaults to env DOC_VENDOR or 'landing_ai'.",
    )


class Citation(BaseModel):
    """Anchors an extracted field back to a region of the source PDF.

    Landing AI returns chunks with bounding boxes; we map each schema field
    to the chunk that produced it via chunk_reference. This is what powers
    the per-document UI's bbox-overlay PDF viewer.
    """
    model_config = ConfigDict(extra="forbid")

    field_path: str = Field(..., description="Dotted path into the extracted_fields object")
    chunk_id: str | None = Field(default=None, description="Vendor-issued chunk identifier")
    page: int | None = Field(default=None, ge=1)
    bbox: tuple[float, float, float, float] | None = Field(
        default=None,
        description="Normalized bounding box (left, top, right, bottom) in [0,1]",
    )
    excerpt: str | None = Field(default=None, max_length=500)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class ExtractedFields(BaseModel):
    """Vendor-emitted extraction; loose schema (vendor-shaped) but typed wrapper."""
    model_config = ConfigDict(extra="allow")

    # Vendor populates whatever extraction schema dictates; we don't constrain
    # the shape here because each doc_type has its own. We DO constrain via
    # JSON Schema validation in audit.py against the per-doc-type schema.


class VendorWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Literal[
        "nonconformant_schema",
        "nonconformant_output",
        "low_confidence",
        "ocr_required",
        "page_failure",
        "rate_limited",
        "vendor_fallback_used",
    ]
    msg: str
    page: int | None = None
    field_path: str | None = None


class ExtractResponse(BaseModel):
    """POST /extract output. This shape is what the orchestrator consumes
    and what we persist to application_events.payload.
    """
    model_config = ConfigDict(extra="forbid")

    doc_id: str
    doc_type: DocType
    application_id: str

    extracted_fields: dict[str, Any] = Field(
        default_factory=dict,
        description="Raw extraction object matching the doc_type's extraction_schema",
    )
    missing_required_fields: list[str] = Field(
        default_factory=list,
        description="Required field paths from document_requirements.json that weren't extracted",
    )
    missing_preferred_fields: list[str] = Field(
        default_factory=list,
        description="Preferred field paths that weren't extracted (informational)",
    )
    citations: list[Citation] = Field(
        default_factory=list,
        description="One per extracted leaf field where the vendor returned a chunk reference",
    )

    confidence: float = Field(..., ge=0.0, le=1.0, description="Vendor-reported overall confidence")
    requires_human_review: bool = Field(
        default=False,
        description="True if confidence < threshold OR critical missing_required_fields",
    )

    vendor: VendorName
    vendor_model: str | None = Field(
        default=None,
        description="Specific model/version used by the vendor (e.g. 'dpt-2-latest' for Landing AI)",
    )
    credit_usage_units: float = Field(
        default=0.0,
        description="Vendor-reported credit/token usage; cost-budget gate reads this",
    )
    estimated_cost_usd: float = Field(
        default=0.0,
        ge=0.0,
        description="Estimated cost in USD; cost-budget gate fails build if > budget",
    )

    page_count: int | None = Field(default=None, ge=0)
    latency_ms: int = Field(..., ge=0)

    warnings: list[VendorWarning] = Field(default_factory=list)

    failed: bool = Field(default=False)
    error_code: str | None = Field(default=None)
    error_message: str | None = Field(default=None, max_length=2000)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["healthy", "degraded", "down"]
    vendor_default: VendorName
    vendor_reachable: bool
    git_sha: str | None = None
