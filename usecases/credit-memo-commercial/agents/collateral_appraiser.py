"""
credit-memo-commercial collateral_appraiser agent.

Interprets appraisal documents and applies the bank's haircut schedule per
12 CFR 34. Computes lendable value by collateral class, total coverage ratio,
and flags transactions requiring an independent appraisal under 12 CFR 34.43
(>$500k commercial real estate transactions).
Memory scope: borrower_id — appraisal vintages and lien stacks persist.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

collateral_appraiser_agent = LlmAgent(
    name="credit_memo_collateral_appraiser",
    model=Claude("claude-opus-4-7"),
    description=(
        "Interprets appraisal evidence, applies 12 CFR 34 haircuts by collateral class, "
        "computes lendable value and coverage ratio, and flags appraisal-required "
        "transactions (>$500k CRE) under 12 CFR 34.43."
    ),
    instruction=(PROMPT_DIR / "collateral_appraiser.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="collateral_assessment",
)
