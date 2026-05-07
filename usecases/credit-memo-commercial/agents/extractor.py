"""
credit-memo-commercial extractor agent — document-extractor@1.0 instantiation.

Extracts structured financial data from uploaded borrower documents
(10-K, 10-Q, board minutes, audited financials) into the ExtractedFinancials schema.
Memory scope: borrower_id — shares context across memo revisions for the same borrower.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

extractor_agent = LlmAgent(
    name="credit_memo_extractor",
    model=Claude("claude-opus-4-7"),
    description="Extracts structured financial statements from borrower documents (10-K, 10-Q, board minutes) into the ExtractedFinancials schema.",
    instruction=(PROMPT_DIR / "extractor.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="extracted_financials",
)
