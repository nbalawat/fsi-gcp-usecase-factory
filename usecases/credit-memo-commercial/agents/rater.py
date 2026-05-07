"""
credit-memo-commercial rater agent — risk-rater@1.0 instantiation.

Pre-computed pattern: the Cloud Workflow runs 7 atomic services in parallel
(fan-out-join) and passes service_results + rules_result to this agent.
This agent does NOT call atomic services — it analyses pre-computed data.

Responsibility: consume service_results, apply the commercial-credit-rubric-v1
weighting model, and emit a RiskRating (OCC bands 1-pass through 5-loss).
Memory scope: borrower_id.
"""
from __future__ import annotations

from pathlib import Path

from google.adk.agents import LlmAgent

PROMPT_DIR = Path(__file__).parent / "prompts"

rater_agent = LlmAgent(
    name="credit_memo_rater",
    model="claude-opus-4-7",
    description=(
        "Rates commercial loan risk (OCC bands 1-pass through 5-loss) by analysing "
        "pre-computed atomic service outputs (DSCR, covenants, peers, industry, "
        "collateral, exposure) passed by the Cloud Workflow. "
        "Instantiation of risk-rater@1.0 under rubric commercial-credit-rubric-v1."
    ),
    instruction=(PROMPT_DIR / "rater.md").read_text(),
    tools=[],  # pre-computed pattern — workflow provides service_results in context
    output_key="risk_rating",
)
