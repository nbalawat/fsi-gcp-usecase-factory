"""Document processor agent — Track C consolidation (2 → 1).

Replaces:
  - document_classifier (classified upload by doc_type)
  - extractor (extracted financial fields per doc)

The classifier role is now done by the user at upload time (the multi-doc
upload route requires explicit `doc_type` per file). The extractor role
is now done by `services/atomic/document-extractor` via Landing AI ADE.

What's left for this agent: **cross-document reconciliation**. When two
docs disagree on a value (e.g. 10-K says revenue=$100M but 10-Q sum says
$104M), the agent decides which to trust + why. It also surfaces
red-flag inconsistencies (e.g. management list in board minutes
contradicts officers list in 10-K).

Single Vertex Gemini call with response_schema; deterministic structure.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

PROMPT_DIR = Path(__file__).parent / "prompts"


DOCUMENT_PROCESSOR_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "reconciled_financials",
        "discrepancies",
        "trust_decisions",
        "missing_required_fields",
    ],
    "properties": {
        "reconciled_financials": {
            "type": "OBJECT",
            "description": (
                "The single set of financial values to use downstream, after "
                "reconciling across submitted documents. Same shape as the "
                "10-K extraction schema; values are absolute USD."
            ),
            "properties": {
                "fiscal_year_end": {"type": "STRING"},
                "income_statement": {"type": "OBJECT"},
                "balance_sheet": {"type": "OBJECT"},
                "cash_flow": {"type": "OBJECT"},
            },
        },
        "discrepancies": {
            "type": "ARRAY",
            "description": "Inconsistencies the underwriter should be aware of.",
            "items": {
                "type": "OBJECT",
                "required": ["field_path", "values", "severity"],
                "properties": {
                    "field_path": {"type": "STRING"},
                    "values": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "required": ["doc_id", "value"],
                            "properties": {
                                "doc_id": {"type": "STRING"},
                                "doc_type": {"type": "STRING"},
                                "value": {"type": "STRING"},
                            },
                        },
                    },
                    "severity": {
                        "type": "STRING",
                        "enum": ["minor", "material", "blocker"],
                    },
                    "explanation": {"type": "STRING"},
                },
            },
        },
        "trust_decisions": {
            "type": "ARRAY",
            "description": "Per-field decision about which document is authoritative.",
            "items": {
                "type": "OBJECT",
                "required": ["field_path", "trusted_doc_id", "rationale"],
                "properties": {
                    "field_path": {"type": "STRING"},
                    "trusted_doc_id": {"type": "STRING"},
                    "trusted_doc_type": {"type": "STRING"},
                    "rationale": {"type": "STRING"},
                },
            },
        },
        "missing_required_fields": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
        },
    },
}


def build_document_processor_agent():  # pragma: no cover
    from google.adk.agents import LlmAgent
    from google.adk.models import Gemini

    return LlmAgent(
        name="credit_memo_document_processor",
        model=Gemini("gemini-3-1-flash"),
        description=(
            "Reconciles per-document extraction outputs from "
            "atomic/document-extractor. Decides which doc to trust per "
            "field; surfaces material discrepancies."
        ),
        instruction=(PROMPT_DIR / "document_processor.md").read_text(),
        tools=[],
        memory_scope="application",
        output_key="reconciled_documents",
    )
