"""
credit-memo-commercial memo_reviewer agent.

Second-pass critic over the drafter's memo. Verifies citation density,
math reconciliation across sections, and absence of internal contradictions.
If quality is not approved, the orchestrator routes the memo back to the
drafter with the specific revisions list.
Memory scope: borrower_id — review history informs subsequent revisions.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

memo_reviewer_agent = LlmAgent(
    name="credit_memo_reviewer",
    model=Claude("claude-opus-4-7"),
    description=(
        "Second-pass quality reviewer: checks citation density, cross-section math "
        "reconciliation, and internal contradictions; emits approve/revise/reject with "
        "specific revisions for the drafter."
    ),
    instruction=(PROMPT_DIR / "memo_reviewer.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="memo_review_report",
)
