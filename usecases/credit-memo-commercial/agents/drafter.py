"""
credit-memo-commercial drafter agent — narrative-drafter@1.0 instantiation.

Synthesises ExtractedFinancials + RiskRating into a credit memo narrative
in the credit-memo-occ-v1 format. Max 1500 words. Citation density >= 0.8.
Memory scope: borrower_id.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

drafter_agent = LlmAgent(
    name="credit_memo_drafter",
    model=Claude("claude-opus-4-7"),
    description="Drafts the credit memo narrative from financial analysis and risk rating, following OCC credit memo format. Max 1500 words with citation density >= 0.8.",
    instruction=(PROMPT_DIR / "drafter.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="credit_memo",
)
