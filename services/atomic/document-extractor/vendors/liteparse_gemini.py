"""Fallback vendor: LlamaIndex LiteParse (PDF → markdown, local) + Vertex
Gemini (markdown + schema → typed extraction).

Use cases:
    1. Vendor outage at Landing AI; flip DOC_VENDOR=liteparse_gemini
    2. Cost mitigation: LiteParse is free / runs locally; Gemini schema-extract
       costs less than Landing AI ADE Extract for some payload sizes
    3. Compliance / data residency: LiteParse runs in-process; nothing leaves
       the bank's VPC

This implementation is the SAFETY NET. The MVP path uses Landing AI; this
exists so a fallback is testable + provable + documented.

NOTE: this module imports liteparse + google-genai lazily so the default
Landing AI path doesn't require either package at runtime.
"""
from __future__ import annotations

import json
import os
from typing import Any

from .types import VendorCitation, VendorResult


class LiteParseGeminiVendor:
    """Two-stage fallback: LiteParse parse + Vertex Gemini schema extraction."""

    name = "liteparse_gemini"

    def __init__(self) -> None:
        self.gcp_project = os.environ.get("GCP_PROJECT")
        self.gcp_region = os.environ.get("GCP_REGION", "us-central1")
        self.model = os.environ.get("LITEPARSE_GEMINI_MODEL", "gemini-2.5-pro")
        if not self.gcp_project:
            raise RuntimeError("GCP_PROJECT env var unset; required for Vertex Gemini path.")

    def health_check(self) -> bool:
        try:
            # Lazy imports — keep the default path lightweight
            import liteparse  # noqa: F401
            from google import genai  # noqa: F401
            return True
        except ImportError as exc:
            print(f"[liteparse_gemini] missing dependency: {exc}", flush=True)
            return False

    def extract(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        doc_type: str,
        extraction_schema: dict[str, Any],
    ) -> VendorResult:
        # Stage 1 — LiteParse: PDF → markdown + bounding boxes (local, no LLM)
        try:
            import liteparse  # type: ignore[import-not-found]
        except ImportError:
            raise FallbackUnavailableError(
                "LiteParse not installed. pip install liteparse to enable this vendor."
            )

        parse_result = liteparse.parse_pdf(pdf_bytes)  # API may differ from this assumption
        # parse_result expected to expose: markdown, pages[i].bbox_blocks
        markdown = parse_result.markdown
        pages_meta = getattr(parse_result, "pages", [])

        # Stage 2 — Vertex Gemini schema extraction
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(vertexai=True, project=self.gcp_project, location=self.gcp_region)
        prompt = (
            "You are an expert financial-document extractor. The document below is a "
            f"{doc_type}. Extract the fields specified by the response schema. "
            "Return null for fields not present in the document. Use the document's "
            "stated units (thousands / millions) — the orchestrator normalizes."
        )
        resp = client.models.generate_content(
            model=self.model,
            contents=markdown[:300_000],  # Gemini context limit guard
            config=genai_types.GenerateContentConfig(
                system_instruction=prompt,
                response_mime_type="application/json",
                response_schema=extraction_schema,
                temperature=0.1,
                max_output_tokens=16384,
            ),
        )

        try:
            extracted = json.loads(resp.text)
        except json.JSONDecodeError as exc:
            return VendorResult(
                extracted_fields={},
                confidence=0.0,
                vendor_model=self.model,
                warnings=[{
                    "code": "nonconformant_output",
                    "msg": f"Gemini returned non-JSON: {exc}",
                    "field_path": None,
                    "page": None,
                }],
                raw_markdown=markdown,
            )

        # Citations: Gemini doesn't natively emit chunk references, so we
        # produce per-field citations only when the field's value appears
        # verbatim in a parsed bbox block. Lower-fidelity than Landing AI's
        # native chunk_reference support, but better than nothing.
        citations = self._best_effort_citations(extracted, pages_meta)

        # Cost estimate: Gemini 2.5 Pro at ~$1.25/M input + $10/M output
        usage = getattr(resp, "usage_metadata", None)
        tokens_in = getattr(usage, "prompt_token_count", 0) or 0
        tokens_out = getattr(usage, "candidates_token_count", 0) or 0
        cost = (tokens_in / 1_000_000) * 1.25 + (tokens_out / 1_000_000) * 10.0

        return VendorResult(
            extracted_fields=extracted,
            citations=citations,
            confidence=0.85,  # Lower than Landing AI — no chunk-anchor verification
            page_count=len(pages_meta) or None,
            vendor_model=self.model,
            credit_usage_units=tokens_in + tokens_out,
            estimated_cost_usd=cost,
            warnings=[
                {
                    "code": "vendor_fallback_used",
                    "msg": "Using LiteParse + Gemini fallback; citations are best-effort",
                    "field_path": None,
                    "page": None,
                }
            ],
            raw_markdown=markdown,
        )

    def _best_effort_citations(self, extracted: dict[str, Any], pages_meta: list[Any]) -> list[VendorCitation]:
        """Walk the extracted dict; for each leaf string value, scan the
        parsed bbox blocks for a verbatim match. Returns at most one
        citation per leaf field. Crude but useful as a fallback."""
        citations: list[VendorCitation] = []

        def walk(obj: Any, path: str) -> None:
            if isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{path}.{k}" if path else k)
            elif isinstance(obj, list):
                for i, v in enumerate(obj):
                    walk(v, f"{path}[{i}]")
            elif isinstance(obj, str) and obj and len(obj) > 4:
                for page_idx, page in enumerate(pages_meta):
                    blocks = getattr(page, "bbox_blocks", []) or []
                    for block in blocks:
                        text = getattr(block, "text", "") or ""
                        if obj in text:
                            citations.append(
                                VendorCitation(
                                    field_path=path,
                                    page=page_idx + 1,
                                    bbox=getattr(block, "bbox", None),
                                    excerpt=text[:300],
                                )
                            )
                            return  # one citation per field is enough

        walk(extracted, "")
        return citations


class FallbackUnavailableError(RuntimeError):
    """Raised when the LiteParse fallback cannot be loaded."""
