"""
credit-memo-commercial regulatory_checker agent.

Runs the regulatory compliance checks mandated for every commercial credit
memo: 12 CFR 32 (single-borrower lending limit), 12 CFR 215 (Reg O insider
lending), 12 CFR 34 (appraisal requirements), Reg B/ECOA (fair lending),
and BSA/OFAC. The orchestrator pre-fetches the deployed exposure-aggregator
and insider-screening atomic service results and passes them as input;
this agent interprets the numbers, applies the regulations, and narrates.
Memory scope: borrower_id — insider relationships and exposure history persist.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

regulatory_checker_agent = LlmAgent(
    name="credit_memo_regulatory_checker",
    model=Claude("claude-opus-4-7"),
    description=(
        "Runs 12 CFR 32 single-borrower, 12 CFR 215 Reg O, 12 CFR 34 appraisal, "
        "Reg B/ECOA fair-lending, and BSA/OFAC checks; interprets pre-fetched "
        "exposure-aggregator and insider-screening outputs and narrates required actions."
    ),
    instruction=(PROMPT_DIR / "regulatory_checker.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="regulatory_compliance",
)
