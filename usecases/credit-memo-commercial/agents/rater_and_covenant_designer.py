"""Rater + Covenant Designer agent — Track C consolidation (2 → 1).

Replaces:
  - rater (assigned the OCC risk band 1-5 + drivers)
  - covenant_designer (assembled the covenant package)

Both consume the analyst output + service_results and the second always
ran on top of the first's output. Merging them into one Vertex Gemini
call (with response_schema) cuts a full LLM round-trip and keeps the
rationale-to-covenant linkage tight (the same model writes both, so the
covenants directly address the drivers it cited).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

PROMPT_DIR = Path(__file__).parent / "prompts"


RATER_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": ["risk_band", "drivers", "covenant_package", "monitoring_cadence"],
    "properties": {
        "risk_band": {
            "type": "STRING",
            "description": "OCC regulatory risk band; banker label rendered in UI.",
            "enum": [
                "1-pass",
                "2-special-mention",
                "3-substandard",
                "4-doubtful",
                "5-loss",
            ],
        },
        "drivers": {
            "type": "ARRAY",
            "description": (
                "Ordered list of the factors that determined the risk band. "
                "Each driver references a citation in the analyst output."
            ),
            "items": {
                "type": "OBJECT",
                "required": ["factor", "polarity", "weight"],
                "properties": {
                    "factor": {"type": "STRING"},
                    "polarity": {
                        "type": "STRING",
                        "enum": ["mitigant", "neutral", "concern"],
                    },
                    "weight": {
                        "type": "STRING",
                        "enum": ["low", "medium", "high"],
                    },
                    "evidence": {
                        "type": "OBJECT",
                        "properties": {
                            "doc_id": {"type": "STRING"},
                            "page": {"type": "INTEGER"},
                            "excerpt": {"type": "STRING"},
                        },
                    },
                },
            },
        },
        "covenant_package": {
            "type": "OBJECT",
            "required": ["financial_covenants", "negative_covenants", "reporting_covenants"],
            "properties": {
                "financial_covenants": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["name", "threshold", "test_frequency"],
                        "properties": {
                            "name": {"type": "STRING"},
                            "threshold": {"type": "STRING"},
                            "test_frequency": {
                                "type": "STRING",
                                "enum": ["monthly", "quarterly", "annually"],
                            },
                            "rationale": {"type": "STRING"},
                        },
                    },
                },
                "negative_covenants": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["name", "rationale"],
                        "properties": {
                            "name": {"type": "STRING"},
                            "exception": {"type": "STRING"},
                            "rationale": {"type": "STRING"},
                        },
                    },
                },
                "reporting_covenants": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "required": ["name", "frequency"],
                        "properties": {
                            "name": {"type": "STRING"},
                            "frequency": {
                                "type": "STRING",
                                "enum": ["monthly", "quarterly", "annually", "ad-hoc"],
                            },
                            "due_days": {"type": "INTEGER"},
                        },
                    },
                },
            },
        },
        "monitoring_cadence": {
            "type": "STRING",
            "enum": ["light", "standard", "intensive", "watch_list"],
        },
        "raac_summary": {
            "type": "STRING",
            "description": "1-3 sentence Risk Acceptance & Approval Committee summary",
        },
    },
}


def build_rater_agent():  # pragma: no cover
    from google.adk.agents import LlmAgent
    from google.adk.models import Claude

    return LlmAgent(
        name="credit_memo_rater_and_covenant_designer",
        model=Claude("claude-opus-4-7"),
        description=(
            "Single agent that produces both the OCC risk-band rating "
            "AND the covenant package, with each covenant pinned to a "
            "specific driver from the rating rationale."
        ),
        instruction=(PROMPT_DIR / "rater_and_covenant_designer.md").read_text(),
        tools=[],
        memory_scope="application",
        output_key="rating_and_covenants",
    )
