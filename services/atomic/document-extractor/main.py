"""Cloud Run entry point — atomic.document-extractor.

POST /extract
    Receives ExtractRequest (Pydantic-validated). Downloads the PDF from
    GCS, dispatches to the configured vendor, validates the extraction
    against the per-doc-type JSON schema, computes missing required +
    preferred fields, writes one application_events row, returns
    ExtractResponse.

GET /health
    Verifies vendor reachability + credentials. Used by smoke tests.

Pydantic at every boundary. No silent stubs. Loud on failure.
"""
from __future__ import annotations

import os
import sys
import time
import traceback
from typing import Any

import functions_framework
from google.cloud import storage
from pydantic import ValidationError

import audit
import requirements_loader as reqloader
from schemas import (
    Citation,
    ExtractRequest,
    ExtractResponse,
    HealthResponse,
    VendorWarning,
)
from vendors import get_vendor
from vendors.types import VendorResult


SERVICE_NAME = "document-extractor"

# ---- Boot-time env validation (Rule 20 of product-build-discipline) -----

REQUIRED_ENV = ["GCP_PROJECT"]


def _assert_env(required: list[str]) -> None:
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        raise SystemExit(
            f"FATAL: required env unset for {SERVICE_NAME}: {missing}. "
            f"Set via gcloud run deploy --set-env-vars / --set-secrets."
        )


# Skip the assertion under pytest so unit tests don't need the full GCP env
if "PYTEST_CURRENT_TEST" not in os.environ and "CI_SKIP_ASSERT_ENV" not in os.environ:
    _assert_env(REQUIRED_ENV)


# ---- HTTP entry point ---------------------------------------------------


@functions_framework.http
def http(request: Any) -> Any:
    """Single dispatching entry point — Cloud Run / Cloud Functions
    convention. Routes by request.path."""
    path = (request.path or "/").rstrip("/")

    if request.method == "GET" and (path == "" or path == "/health"):
        return _handle_health()

    if request.method == "POST" and (path == "" or path == "/extract"):
        return _handle_extract(request)

    return ({"error": "not_found", "path": request.path, "method": request.method}, 404)


def _handle_health() -> tuple[dict[str, Any], int]:
    vendor_name = os.environ.get("DOC_VENDOR", "landing_ai")
    try:
        vendor = get_vendor(vendor_name)
        reachable = vendor.health_check()
    except Exception as exc:
        return (
            HealthResponse(
                status="down",
                vendor_default=vendor_name,  # type: ignore[arg-type]
                vendor_reachable=False,
                git_sha=os.environ.get("GIT_SHA"),
            ).model_dump(),
            503,
        )

    status = "healthy" if reachable else "degraded"
    return (
        HealthResponse(
            status=status,
            vendor_default=vendor_name,  # type: ignore[arg-type]
            vendor_reachable=reachable,
            git_sha=os.environ.get("GIT_SHA"),
        ).model_dump(),
        200 if reachable else 503,
    )


def _handle_extract(request: Any) -> tuple[dict[str, Any], int]:
    """End-to-end extract; emits one application_events row + returns
    ExtractResponse JSON."""
    started = time.monotonic()

    # 1. Validate input
    try:
        body = request.get_json(silent=False) or {}
        req = ExtractRequest.model_validate(body)
    except ValidationError as exc:
        return (
            {"error": "invalid_request", "details": exc.errors()},
            422,
        )
    except Exception as exc:
        return ({"error": "bad_request", "msg": str(exc)[:500]}, 400)

    # 2. Resolve schemas (fast — cached)
    try:
        extraction_schema = reqloader.load_extraction_schema(req.doc_type)
    except (KeyError, FileNotFoundError) as exc:
        return ({"error": "schema_load_failed", "msg": str(exc)}, 500)

    # 3. Download the PDF from GCS
    try:
        pdf_bytes, filename = _download_from_gcs(req.gcs_uri)
    except Exception as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        audit.write_vendor_failure_event(
            application_id=req.application_id,
            doc_id=req.doc_id,
            doc_type=req.doc_type,
            vendor="(none)",
            error_code="gcs_download_failed",
            error_message=str(exc),
            latency_ms=latency_ms,
        )
        return _failure_response(req, "gcs_download_failed", str(exc), latency_ms)

    # 4. Dispatch to vendor
    vendor_name_str = req.vendor_override or os.environ.get("DOC_VENDOR") or "landing_ai"
    try:
        vendor = get_vendor(vendor_name_str)
    except Exception as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        return _failure_response(req, "vendor_unavailable", str(exc), latency_ms)

    try:
        vresult: VendorResult = vendor.extract(
            pdf_bytes=pdf_bytes,
            filename=filename,
            doc_type=req.doc_type,
            extraction_schema=extraction_schema,
        )
    except Exception as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        tb = traceback.format_exc()
        print(f"[document-extractor] vendor {vendor.name} raised: {exc}\n{tb}", file=sys.stderr, flush=True)
        error_code = getattr(exc, "error_code", None) or f"{vendor.name}_exception"
        audit.write_vendor_failure_event(
            application_id=req.application_id,
            doc_id=req.doc_id,
            doc_type=req.doc_type,
            vendor=vendor.name,
            error_code=error_code,
            error_message=str(exc),
            latency_ms=latency_ms,
        )
        return _failure_response(req, error_code, str(exc), latency_ms, vendor=vendor.name)

    # 5. Compute missing fields against the per-doc-type requirements
    required_paths = reqloader.required_field_paths(req.doc_type)
    preferred_paths = reqloader.preferred_field_paths(req.doc_type)
    missing_required = reqloader.find_missing_fields(vresult.extracted_fields, required_paths)
    missing_preferred = reqloader.find_missing_fields(vresult.extracted_fields, preferred_paths)

    requires_human_review = (
        vresult.confidence < 0.7
        or any(f.startswith(("income_statement.revenue", "balance_sheet.total_assets")) for f in missing_required)
    )

    latency_ms = int((time.monotonic() - started) * 1000)

    # 6. Build response
    response = ExtractResponse(
        doc_id=req.doc_id,
        doc_type=req.doc_type,
        application_id=req.application_id,
        extracted_fields=vresult.extracted_fields,
        missing_required_fields=missing_required,
        missing_preferred_fields=missing_preferred,
        citations=[
            Citation(
                field_path=c.field_path,
                chunk_id=c.chunk_id,
                page=c.page,
                bbox=c.bbox,
                excerpt=c.excerpt,
                confidence=c.confidence,
            )
            for c in vresult.citations
        ],
        confidence=vresult.confidence,
        requires_human_review=requires_human_review,
        vendor=vendor.name,  # type: ignore[arg-type]
        vendor_model=vresult.vendor_model,
        credit_usage_units=vresult.credit_usage_units,
        estimated_cost_usd=vresult.estimated_cost_usd,
        page_count=vresult.page_count,
        latency_ms=latency_ms,
        warnings=[VendorWarning(**w) for w in vresult.warnings if isinstance(w, dict)],
        # Pass the parser's per-page markdown through so the analyst /
        # drafter agents can quote real document text instead of riffing
        # on structured fields. Truncate to the field's 60K cap; if the
        # parser already trimmed, keep what we have.
        raw_markdown=(
            (vresult.raw_markdown or "")[:60_000] if vresult.raw_markdown else None
        ),
    )

    # 7. Write audit event (best-effort; no-op under pytest)
    audit.write_extraction_event(
        application_id=req.application_id,
        doc_id=req.doc_id,
        doc_type=req.doc_type,
        payload=response.model_dump(),
        latency_ms=latency_ms,
        cost_usd=vresult.estimated_cost_usd,
    )

    # 8. Return
    return (response.model_dump(), 200)


# ---- Helpers ------------------------------------------------------------


def _download_from_gcs(gcs_uri: str) -> tuple[bytes, str]:
    """gs://bucket/path → (bytes, basename)."""
    if os.environ.get("PYTEST_CURRENT_TEST") and gcs_uri.startswith("file://"):
        # Test convenience: support file:// URIs locally
        local_path = gcs_uri.replace("file://", "")
        with open(local_path, "rb") as f:
            return f.read(), os.path.basename(local_path)

    if not gcs_uri.startswith("gs://"):
        raise ValueError(f"Expected gs:// URI, got {gcs_uri!r}")
    parts = gcs_uri[5:].split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Malformed gs:// URI {gcs_uri!r}")
    bucket_name, blob_path = parts
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    return blob.download_as_bytes(), os.path.basename(blob_path)


def _failure_response(
    req: ExtractRequest,
    error_code: str,
    error_message: str,
    latency_ms: int,
    *,
    vendor: str = "unknown",
) -> tuple[dict[str, Any], int]:
    """Always-200 failure shape — Pub/Sub-friendly. The orchestrator
    inspects `failed: true` to branch into return_for_revision / retry."""
    response = ExtractResponse(
        doc_id=req.doc_id,
        doc_type=req.doc_type,
        application_id=req.application_id,
        extracted_fields={},
        missing_required_fields=reqloader.required_field_paths(req.doc_type),
        missing_preferred_fields=[],
        citations=[],
        confidence=0.0,
        requires_human_review=True,
        vendor=vendor,  # type: ignore[arg-type]
        vendor_model=None,
        credit_usage_units=0.0,
        estimated_cost_usd=0.0,
        latency_ms=latency_ms,
        failed=True,
        error_code=error_code,
        error_message=error_message[:2000],
        warnings=[
            VendorWarning(code="page_failure", msg=f"Extraction failed: {error_code}")
        ],
    )
    return (response.model_dump(), 200)
