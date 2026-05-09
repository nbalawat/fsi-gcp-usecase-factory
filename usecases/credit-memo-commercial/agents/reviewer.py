"""Reviewer agent — Track C (renamed from memo_reviewer).

Audits the drafter's memo for:
  - Citation density (>= 0.80 of numeric claims must have a citation)
  - Coherence (drivers in rater_and_covenant_designer match prose in drafter)
  - Banker tone (no LLM tells: "I would like to", "as an AI", "this analysis")
  - Required-section completeness (10/10 sections populated)

The reviewer's structured output drops directly into the memo's
`reviewer_findings` block which the UI renders as a top-bar status.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

PROMPT_DIR = Path(__file__).parent / "prompts"


REVIEWER_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": ["review_outcome", "findings", "citation_density", "section_coverage"],
    "properties": {
        "review_outcome": {
            "type": "STRING",
            "enum": ["approve", "approve_with_conditions", "return_to_drafter", "escalate"],
        },
        "findings": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["category", "severity", "section", "issue"],
                "properties": {
                    "category": {
                        "type": "STRING",
                        "enum": [
                            "missing_citation",
                            "incoherent_with_rater",
                            "tone",
                            "section_missing",
                            "factual_error",
                            "regulatory_omission",
                        ],
                    },
                    "severity": {
                        "type": "STRING",
                        "enum": ["minor", "material", "blocker"],
                    },
                    "section": {"type": "STRING"},
                    "issue": {"type": "STRING"},
                    "suggested_fix": {"type": "STRING"},
                },
            },
        },
        "citation_density": {
            "type": "NUMBER",
            "description": "Fraction of numeric claims in the memo that carry a citation (0..1)",
        },
        "section_coverage": {
            "type": "NUMBER",
            "description": "Number of memo sections populated (0..10)",
        },
        "summary": {
            "type": "STRING",
            "description": "1-2 sentence underwriter-facing summary",
        },
    },
}


def build_reviewer_agent():  # pragma: no cover
    from google.adk.agents import LlmAgent
    from google.adk.models import Claude

    return LlmAgent(
        name="credit_memo_reviewer",
        model=Claude("claude-opus-4-7"),
        description=(
            "Audits the drafter's memo for citation density, coherence "
            "with the rating rationale, banker tone, and section "
            "completeness. Returns a structured review outcome."
        ),
        instruction=(PROMPT_DIR / "reviewer.md").read_text(),
        tools=[],
        memory_scope="application",
        output_key="reviewer_findings",
    )
