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
            import pypdf  # noqa: F401
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
        # Stage 1 — pypdf: PDF → per-page text (local, no LLM, no vendor)
        # Replaces the original liteparse parse_pdf call. pypdf is lighter
        # weight + already in the broader stack; it gives us page text +
        # page numbers, which is what the citation matcher needs.
        import io
        from pypdf import PdfReader  # type: ignore[import-not-found]

        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
        except Exception as exc:
            raise FallbackUnavailableError(f"pypdf could not parse PDF: {exc}")

        # Build page-indexed text for citation matching + a flattened
        # markdown-ish blob for Gemini's input. Each page is prefixed with
        # a "Page N" marker so Gemini can echo back the page number when
        # we ask it to.
        pages_meta: list[Any] = []  # list of {page, text}
        markdown_parts: list[str] = []
        for i, p in enumerate(reader.pages):
            try:
                txt = p.extract_text() or ""
            except Exception:
                txt = ""
            txt = txt.strip()
            pages_meta.append({"page": i + 1, "text": txt})
            if txt:
                markdown_parts.append(f"\n\n--- Page {i + 1} ---\n\n{txt}")
        markdown = "".join(markdown_parts)

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

        # Convert the JSON-Schema-draft-07 extraction schema to the
        # OpenAPI-3-flavored shape Gemini accepts as response_schema.
        # JSON Schema uses `type: ["number", "null"]` for nullable fields;
        # Gemini requires `type: "NUMBER"` + `nullable: true`. Without this
        # conversion the SDK crashes with `'list' object has no attribute
        # 'upper'` when it tries to uppercase the type string.
        gemini_schema = _jsonschema_to_gemini(extraction_schema)

        resp = client.models.generate_content(
            model=self.model,
            contents=markdown[:300_000],  # Gemini context limit guard
            config=genai_types.GenerateContentConfig(
                system_instruction=prompt,
                response_mime_type="application/json",
                response_schema=gemini_schema,
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

    def _best_effort_citations(
        self, extracted: dict[str, Any], pages_meta: list[Any]
    ) -> list[VendorCitation]:
        """Walk the extracted dict; for each leaf value, scan each page's
        text for a verbatim match. For numeric leaves we also try the
        comma-formatted variant (e.g. 364482 → "364,482") since 10-K
        balance-sheet tables format numbers with commas.

        Returns at most one citation per leaf field — that's enough to
        anchor the field to a page; the UI groups multiple per (doc, page).
        """
        citations: list[VendorCitation] = []

        def candidates(value: Any) -> list[str]:
            if isinstance(value, str) and len(value) > 4:
                return [value]
            if isinstance(value, (int, float)) and value not in (0, 0.0):
                # Numbers in 10-Ks are usually comma-formatted; also try
                # without commas. Skip values that are too small to be
                # uniquely identifiable (could match incidentally).
                n = int(value) if isinstance(value, float) and value.is_integer() else value
                a = str(n)
                b = f"{n:,}" if isinstance(n, int) and abs(n) >= 1000 else None
                out = [a]
                if b and b != a:
                    out.append(b)
                return [s for s in out if len(s) >= 4]
            if isinstance(value, bool):
                return []
            return []

        def excerpt_around(text: str, needle: str, span: int = 240) -> str:
            i = text.find(needle)
            if i < 0:
                return text[:span]
            start = max(0, i - span // 4)
            end = min(len(text), i + len(needle) + (3 * span) // 4)
            return text[start:end].strip()

        def walk(obj: Any, path: str) -> None:
            if isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{path}.{k}" if path else k)
            elif isinstance(obj, list):
                for i, v in enumerate(obj):
                    walk(v, f"{path}[{i}]")
            else:
                for cand in candidates(obj):
                    for page in pages_meta:
                        text = page.get("text", "") if isinstance(page, dict) else ""
                        if cand in text:
                            citations.append(
                                VendorCitation(
                                    field_path=path,
                                    page=page.get("page") if isinstance(page, dict) else None,
                                    bbox=None,
                                    excerpt=excerpt_around(text, cand),
                                )
                            )
                            return  # one citation per field is enough

        walk(extracted, "")
        return citations


class FallbackUnavailableError(RuntimeError):
    """Raised when the LiteParse fallback cannot be loaded."""


# ── JSON Schema → Gemini response_schema adapter ────────────────────────


_DROP_KEYS = {
    "$schema",
    "$id",
    "$ref",
    "title",
    "default",
    "additionalProperties",
    "examples",
    "format",  # Gemini doesn't accept all draft-07 formats
    "patternProperties",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "pattern",
    "uniqueItems",
}


def _jsonschema_to_gemini(schema: Any) -> Any:
    """Convert JSON-Schema-draft-07 to the OpenAPI-3 shape Gemini's
    `response_schema` accepts.

    Handles the most-common transformations:

      - `type: ["X", "null"]` → `type: "X", nullable: true`
      - Strips draft-07 metadata (`$schema`, `$id`, `additionalProperties`,
        unsupported `format` strings, etc.) that Gemini rejects.
      - Recurses into `properties.*`, `items`, `oneOf`/`anyOf` (keeps the
        first non-null branch — Gemini doesn't support union types).
    """
    if not isinstance(schema, dict):
        return schema

    out: dict[str, Any] = {}

    # Handle nullable union: type: ["number", "null"] → type:"number" + nullable
    raw_type = schema.get("type")
    nullable_from_type = False
    if isinstance(raw_type, list):
        non_null = [t for t in raw_type if t != "null"]
        if "null" in raw_type:
            nullable_from_type = True
        if len(non_null) == 1:
            out["type"] = non_null[0]
        elif len(non_null) > 1:
            # Pick the most informative type. Prefer object/array > string > number.
            order = ["object", "array", "string", "number", "integer", "boolean"]
            out["type"] = next((t for t in order if t in non_null), non_null[0])
        # else: only "null" — fallthrough, no type set
    elif isinstance(raw_type, str):
        out["type"] = raw_type

    if nullable_from_type or schema.get("nullable") is True:
        out["nullable"] = True

    # Carry over fields Gemini knows about
    if "description" in schema:
        out["description"] = schema["description"]
    if "enum" in schema:
        out["enum"] = schema["enum"]

    # Recurse into properties / items
    if "properties" in schema:
        out["properties"] = {
            k: _jsonschema_to_gemini(v) for k, v in schema["properties"].items()
        }
    if "items" in schema:
        out["items"] = _jsonschema_to_gemini(schema["items"])
    if "required" in schema:
        out["required"] = schema["required"]

    # Handle oneOf/anyOf — Gemini doesn't support unions, so we collapse
    # to the first non-trivial branch. Lossy but acceptable for the
    # fallback-vendor path.
    for k in ("oneOf", "anyOf"):
        if k in schema and isinstance(schema[k], list) and schema[k]:
            for branch in schema[k]:
                if isinstance(branch, dict) and branch.get("type") != "null":
                    converted = _jsonschema_to_gemini(branch)
                    out.update(converted)
                    break

    # Anything else we drop silently (the _DROP_KEYS list documents the
    # known-rejected fields).
    return out
