"""
credit-memo-commercial covenant_designer agent.

Designs the maintenance + incurrence covenant package given the base-case
projection and the proposed risk rating. Floors and caps are calibrated to
provide ≥10% headroom at base case; tighter for special-mention and
substandard borrowers.
Memory scope: borrower_id — covenant cadence persists across renewals.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

covenant_designer_agent = LlmAgent(
    name="credit_memo_covenant_designer",
    model=Claude("claude-opus-4-7"),
    description=(
        "Designs the covenant package (maintenance + incurrence) calibrated to ≥10% "
        "headroom at base case and tighter on SM/Sub credits; emits thresholds, test "
        "cadence, grace periods, and per-covenant rationale."
    ),
    instruction=(PROMPT_DIR / "covenant_designer.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="covenant_package",
)
