"""Agent using an unapproved model — agent-validator must FAIL."""
from pathlib import Path
from google.adk.agents import LlmAgent

PROMPT_DIR = Path(__file__).parent / "prompts"

rater_agent = LlmAgent(
    name="uc_x_rater",
    model="gpt-4o",
    description="Rates uc-x cases with the wrong model.",
    instruction=(PROMPT_DIR / "rater.md").read_text(),
    tools=[],
)
