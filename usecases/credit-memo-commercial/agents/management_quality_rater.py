"""
credit-memo-commercial management_quality_rater agent.

Assesses CEO/CFO tenure, succession risk, board composition, and any prior
workouts/restructurings disclosed in board minutes or 10-K. Reads the
extracted_financials and classified_docs slots produced upstream and emits
a strong/adequate/weak rating with cited evidence and red flags.
Memory scope: borrower_id — supports trend assessment across memo revisions.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

management_quality_rater_agent = LlmAgent(
    name="credit_memo_management_quality_rater",
    model=Claude("claude-opus-4-7"),
    description="Rates management quality (strong/adequate/weak) using CEO/CFO tenure, succession risk, board composition, and prior workouts — every claim tied to source citation.",
    instruction=(PROMPT_DIR / "management_quality_rater.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="management_quality",
)
