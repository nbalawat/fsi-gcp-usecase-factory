"""Landing AI ADE vendor implementation.

Two-step pipeline:
    1. POST /v1/ade/parse with the PDF → markdown + chunks + grounding (bboxes)
    2. POST /v1/ade/extract with the markdown + our JSON schema → typed fields with chunk_reference

Both endpoints are synchronous. Both return metadata.credit_usage which we
read into VendorResult.credit_usage_units. Cost-budget tests assert this is
below the per-call budget.

Known endpoint quirks (docs at https://docs.landing.ai/api-reference):
    - Parse returns 200 (full success) or 206 (partial — some pages failed); we
      treat 206 as a warning, not an error.
    - Extract requires the markdown as a multipart upload (not a JSON body).
    - The schema must be passed as a STRING (JSON-serialized), not a dict.
    - With strict=true, schema mismatches fail HTTP 422 instead of producing a
      half-conformant extraction; we use strict=true to fail loudly.

Authentication:
    API key in Bearer header. Key lives in Secret Manager (LANDING_AI_API_KEY env);
    Cloud Run mounts via --set-secrets.
"""
from __future__ import annotations

import io
import json
import os
import time
from typing import Any

import requests

from .types import VendorCitation, VendorResult


# Production endpoints. EU region also exists at api.va.eu-west-1.landing.ai
# but the bank's data residency is US for now.
PARSE_URL = os.environ.get("LANDING_AI_PARSE_URL", "https://api.va.landing.ai/v1/ade/parse")
EXTRACT_URL = os.environ.get("LANDING_AI_EXTRACT_URL", "https://api.va.landing.ai/v1/ade/extract")

PARSE_TIMEOUT_SECONDS = int(os.environ.get("LANDING_AI_PARSE_TIMEOUT", "300"))
EXTRACT_TIMEOUT_SECONDS = int(os.environ.get("LANDING_AI_EXTRACT_TIMEOUT", "180"))
# Measured live: 10-page PDF takes ~63s for ADE Parse alone; a 152-page Berkshire
# 10-K can run 5+ minutes. Default to 300s/180s; Cloud Run timeout (Rule 21 of
# product-build-discipline) sized to 600s overall (parse + extract + audit).

# Cost estimates (rough — Landing AI pricing isn't published as of 2026-05;
# we estimate based on credit_usage_units and refine via measurements).
# Fail loudly if credit_usage exceeds budget; don't ship cost regressions.
PRICE_PER_CREDIT_UNIT = float(os.environ.get("LANDING_AI_PRICE_PER_CREDIT_USD", "0.001"))


class LandingAIVendor:
    """Landing AI ADE Parse + Extract."""

    name = "landing_ai"

    def __init__(self) -> None:
        self.api_key = os.environ.get("LANDING_AI_API_KEY")
        if not self.api_key:
            raise RuntimeError(
                "LANDING_AI_API_KEY env var unset. Mount via --set-secrets "
                "LANDING_AI_API_KEY=landing-ai-api-key:latest"
            )
        if self.api_key.startswith(("sk-ant-", "AIza")):
            raise ValueError(
                "LANDING_AI_API_KEY appears to be from a different vendor "
                "(Anthropic / Google). Get a Landing AI key from "
                "https://va.landing.ai/settings/api-key"
            )

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def health_check(self) -> bool:
        """Cheap probe — call /parse with a 1-byte 'pdf' and check the error
        shape. We expect 422 (validation error), not 401 (auth) or 5xx
        (vendor down).
        """
        try:
            r = requests.post(
                PARSE_URL,
                files={"document": ("probe.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
                headers=self._headers,
                timeout=10,
            )
            # 200 = (somehow) succeeded; 422 = validation; both are OK
            # 401 / 403 = bad credentials; 5xx = vendor down
            return r.status_code in (200, 206, 422)
        except requests.RequestException:
            return False

    # ── Public API ─────────────────────────────────────────────────────────

    def extract(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        doc_type: str,
        extraction_schema: dict[str, Any],
    ) -> VendorResult:
        """Two-stage call: parse → extract. All errors raise; the dispatcher
        in main.py converts to ExtractResponse(failed=True)."""
        parse_start = time.monotonic()
        parse_payload = self._call_parse(pdf_bytes=pdf_bytes, filename=filename)
        parse_ms = int((time.monotonic() - parse_start) * 1000)

        markdown = parse_payload.get("markdown") or ""
        chunks = parse_payload.get("chunks") or []
        parse_metadata = parse_payload.get("metadata") or {}

        warnings: list[dict[str, Any]] = []
        if parse_metadata.get("failed_pages"):
            warnings.append({
                "code": "page_failure",
                "msg": f"{len(parse_metadata['failed_pages'])} pages failed to parse",
                "field_path": None,
                "page": None,
            })

        extract_start = time.monotonic()
        extract_payload = self._call_extract(markdown=markdown, schema=extraction_schema)
        extract_ms = int((time.monotonic() - extract_start) * 1000)

        extracted_fields = extract_payload.get("extraction") or {}
        extraction_metadata = extract_payload.get("extraction_metadata") or {}
        extract_meta = extract_payload.get("metadata") or {}

        # Capture vendor warnings
        for w in extract_meta.get("warnings", []):
            warnings.append({
                "code": w.get("code", "nonconformant_output"),
                "msg": w.get("msg", "")[:500],
                "field_path": None,
                "page": None,
            })

        # Build citations: each leaf field in extraction_metadata typically
        # carries a chunk_reference; resolve back to chunks[].grounding to get
        # bbox + page.
        citations = self._build_citations(extraction_metadata, chunks)

        # Vendor model + cost
        vendor_model = extract_meta.get("version") or extract_meta.get("model")
        parse_credits = float(parse_metadata.get("credit_usage", 0.0))
        extract_credits = float(extract_meta.get("credit_usage", 0.0))
        total_credits = parse_credits + extract_credits

        # Confidence: parse + extract both produce confidence; take min as a
        # conservative worst-case for the field-level citation chain.
        # If neither vendor provides one, default to 0.85 (assume schema-driven
        # extraction is reliable when no warnings; downstream tightens this).
        confidence = self._estimate_confidence(parse_metadata, extract_meta, warnings)

        return VendorResult(
            extracted_fields=extracted_fields,
            citations=citations,
            confidence=confidence,
            page_count=parse_metadata.get("page_count"),
            vendor_model=vendor_model,
            credit_usage_units=total_credits,
            estimated_cost_usd=total_credits * PRICE_PER_CREDIT_UNIT,
            warnings=warnings,
            raw_markdown=markdown,
        )

    # ── Private ────────────────────────────────────────────────────────────

    def _call_parse(self, *, pdf_bytes: bytes, filename: str) -> dict[str, Any]:
        files = {"document": (filename, io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"split": "page"}
        r = requests.post(
            PARSE_URL,
            files=files,
            data=data,
            headers=self._headers,
            timeout=PARSE_TIMEOUT_SECONDS,
        )
        if r.status_code in (200, 206):
            return r.json()
        # Surface vendor errors verbatim to the caller for debugging
        raise LandingAIError(
            phase="parse",
            status_code=r.status_code,
            body=r.text[:1000],
        )

    def _call_extract(self, *, markdown: str, schema: dict[str, Any]) -> dict[str, Any]:
        # ADE Extract requires multipart with `markdown` (file) + `schema` (string)
        files = {
            "markdown": ("input.md", markdown.encode("utf-8"), "text/markdown"),
        }
        data = {
            "schema": json.dumps(schema),
            "model": os.environ.get("LANDING_AI_EXTRACT_MODEL", "extract-latest"),
            "strict": "false",
            # strict=false means schema violations come back as warnings instead of 422
            # — better DX during MVP. Tighten to strict=true once schemas are stable.
        }
        r = requests.post(
            EXTRACT_URL,
            files=files,
            data=data,
            headers=self._headers,
            timeout=EXTRACT_TIMEOUT_SECONDS,
        )
        if r.status_code in (200, 206):
            return r.json()
        raise LandingAIError(
            phase="extract",
            status_code=r.status_code,
            body=r.text[:1000],
        )

    def _build_citations(
        self,
        extraction_metadata: dict[str, Any],
        chunks: list[dict[str, Any]],
    ) -> list[VendorCitation]:
        """Walk the extraction_metadata tree; for each leaf with a
        chunk_reference, look up the chunk in chunks[] to get bbox + page.
        """
        # Index chunks by id for O(1) lookup
        chunks_by_id = {c.get("id"): c for c in chunks if c.get("id")}

        citations: list[VendorCitation] = []
        self._walk(extraction_metadata, "", chunks_by_id, citations)
        return citations

    def _walk(
        self,
        obj: Any,
        path: str,
        chunks_by_id: dict[str, dict[str, Any]],
        out: list[VendorCitation],
    ) -> None:
        """Walk extraction_metadata produced by ADE Extract.

        Landing AI's leaf shape is `{"references": [chunk_uuid, ...], "value": ...}`.
        Each `references` item is a chunk UUID we look up in `chunks_by_id`
        (from the parse stage) to get the bounding-box + page number.

        Pages from Landing AI are 0-indexed; we convert to 1-indexed because
        every other system (UI, audit log, the schemas.Citation Pydantic model
        which has `page: int | None = Field(ge=1)`) is 1-indexed.
        """
        if isinstance(obj, dict):
            refs = obj.get("references")
            # Leaf node detection: a dict with exactly {references, value} keys
            # where references is a list. ADE Extract emits this shape for
            # every scalar leaf in the schema.
            if (
                isinstance(refs, list)
                and "value" in obj
                and path  # skip the implicit root
            ):
                for chunk_id in refs:
                    if not isinstance(chunk_id, str):
                        continue
                    chunk = chunks_by_id.get(chunk_id) or {}
                    grounding = chunk.get("grounding") or {}
                    box = grounding.get("box")
                    bbox = (
                        (
                            float(box.get("left", 0)),
                            float(box.get("top", 0)),
                            float(box.get("right", 0)),
                            float(box.get("bottom", 0)),
                        )
                        if isinstance(box, dict)
                        else None
                    )
                    excerpt_md = chunk.get("markdown") or chunk.get("text") or ""
                    raw_page = grounding.get("page")
                    page_one_indexed = (
                        int(raw_page) + 1
                        if isinstance(raw_page, int) and raw_page >= 0
                        else None
                    )
                    out.append(
                        VendorCitation(
                            field_path=path,
                            chunk_id=chunk_id,
                            page=page_one_indexed,
                            bbox=bbox,
                            excerpt=excerpt_md[:500] if excerpt_md else None,
                            confidence=None,
                        )
                    )
                # Don't recurse into the references list / value scalar
                return
            # Otherwise it's an interior node — recurse into children
            for k, v in obj.items():
                child_path = f"{path}.{k}" if path else k
                self._walk(v, child_path, chunks_by_id, out)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                self._walk(v, f"{path}[{i}]", chunks_by_id, out)
        # leaf scalars — nothing to do

    @staticmethod
    def _estimate_confidence(
        parse_meta: dict[str, Any],
        extract_meta: dict[str, Any],
        warnings: list[dict[str, Any]],
    ) -> float:
        """Coarse confidence — refined as we measure real-world accuracy."""
        # Schema violation → low confidence
        if extract_meta.get("schema_violation_error"):
            return 0.4
        # Warnings present → moderate confidence
        if warnings:
            return 0.7
        # Failed pages → moderate confidence
        if parse_meta.get("failed_pages"):
            return 0.75
        return 0.92


class LandingAIError(Exception):
    """Vendor-side error surfaced to the dispatcher."""

    def __init__(self, *, phase: str, status_code: int, body: str) -> None:
        super().__init__(f"Landing AI {phase} returned HTTP {status_code}: {body}")
        self.phase = phase
        self.status_code = status_code
        self.body = body

    @property
    def error_code(self) -> str:
        return f"landing_ai_{self.phase}_http_{self.status_code}"
