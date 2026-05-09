"""
credit-memo-commercial financial_spreader_agent — narration wrapper around the
deployed `financial-spreader` Cloud Run atomic service.

The orchestrator pre-fetches the spreader service result and passes it as input.
This agent adds the underwriting narrative: one-time-item add-backs, owner-discretionary
expense adjustments, R&D capitalization, and any other normalization adjustments a
banker would make to convert reported financials into a cash-flow-comparable basis.
Memory scope: borrower_id — narrative builds on prior period adjustments.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

financial_spreader_agent = LlmAgent(
    name="credit_memo_financial_spreader",
    model=Claude("claude-opus-4-7"),
    description="Wraps the financial-spreader service output with a banker-grade normalization narrative (add-backs, owner-discretionary, R&D capitalization) and cited adjustments.",
    instruction=(PROMPT_DIR / "financial_spreader_agent.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="spread_financials_with_narrative",
)
