"""
credit-memo-commercial customer_concentration_analyzer agent.

Computes top-N customer concentration from AR aging and 10-K customer
disclosures, including HHI (Herfindahl-Hirschman Index), and applies the
bank's concentration thresholds (substandard / SM / flag).
Memory scope: borrower_id — concentration trends across memo revisions matter.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

customer_concentration_analyzer_agent = LlmAgent(
    name="credit_memo_customer_concentration_analyzer",
    model=Claude("claude-opus-4-7"),
    description="Quantifies top-N customer concentration and HHI from AR aging and 10-K disclosures and flags substandard/SM triggers per the bank's concentration policy.",
    instruction=(PROMPT_DIR / "customer_concentration_analyzer.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="customer_concentration",
)
