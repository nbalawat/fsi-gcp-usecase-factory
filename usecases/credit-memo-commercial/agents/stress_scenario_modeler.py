"""
credit-memo-commercial stress_scenario_modeler agent.

Runs the four stress scenarios required by credit committee convention:
base, downside, recession, and recession+200bps rate shock. Inputs are the
spread financials (with banker normalization) plus pre-computed dscr_calculator
and covenant_analyzer service results passed in by the orchestrator. This
agent does NOT call those services itself — it interprets, projects, and
narrates cliff risk.
Memory scope: borrower_id — projection assumptions evolve across revisions.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Claude

PROMPT_DIR = Path(__file__).parent / "prompts"

stress_scenario_modeler_agent = LlmAgent(
    name="credit_memo_stress_scenario_modeler",
    model=Claude("claude-opus-4-7"),
    description=(
        "Projects revenue, EBITDA, debt service, DSCR, leverage, and covenant headroom "
        "under base, downside, recession, and recession+200bps scenarios; narrates the "
        "cliff (the scenario at which DSCR or a covenant first breaks)."
    ),
    instruction=(PROMPT_DIR / "stress_scenario_modeler.md").read_text(),
    tools=[],
    memory_scope="borrower",
    output_key="stress_scenarios",
)
