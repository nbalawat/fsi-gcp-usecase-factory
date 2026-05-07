"""example-uc rater agent — risk-rater@1.0 instantiation.

Pre-computed pattern: the workflow runs all atomic services in parallel
and passes service_results + rules_result to this agent via context.
"""
from __future__ import annotations

from pathlib import Path

from google.adk.agents import LlmAgent

PROMPT_DIR = Path(__file__).parent / "prompts"

rater_agent = LlmAgent(
    name="example_uc_rater",
    model="claude-opus-4-7",
    description=(
        "Rates example-uc cases by analysing pre-computed atomic service outputs "
        "(DSCR, peer benchmarks, exposure) under the example-credit-rubric-v1."
    ),
    instruction=(PROMPT_DIR / "rater.md").read_text(),
    tools=[],
    output_key="risk_rating",
)
