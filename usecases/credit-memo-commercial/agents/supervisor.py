"""
credit-memo-commercial supervisor — extractor-spreader-rater-drafter@1.0 pattern.

Coordinates: extractor → financial-spreader (via workflow) → rater → drafter.
Memory scope: borrower_id.
The supervisor is the public entry point called by Cloud Workflows.
"""
from __future__ import annotations
from pathlib import Path

from google.adk.agents import LlmAgent
from google.adk.models import Claude
from google.adk.tools import AgentTool

from .extractor import extractor_agent
from .rater import rater_agent
from .drafter import drafter_agent

PROMPT_DIR = Path(__file__).parent / "prompts"

supervisor = LlmAgent(
    name="credit_memo_supervisor",
    model=Claude("claude-opus-4-7"),
    description=(
        "Coordinates the credit memo pipeline: extracts financials from borrower documents, "
        "waits for Cloud Workflows to fan out spreader services, rates credit risk, and "
        "drafts the memo. Produces a CreditMemoBundle for credit officer review. "
        "Instantiation of extractor-spreader-rater-drafter@1.0."
    ),
    instruction=(PROMPT_DIR / "supervisor.md").read_text(),
    tools=[
        AgentTool(agent=extractor_agent),
        AgentTool(agent=rater_agent),
        AgentTool(agent=drafter_agent),
    ],
    memory_scope="borrower",
    output_key="credit_memo_bundle",
)

# Public entry point for Cloud Workflows
agent = supervisor
