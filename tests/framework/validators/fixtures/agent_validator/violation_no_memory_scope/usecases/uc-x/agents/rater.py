"""Clean ADK agent — approved model, no PII, has prompt + manifest."""
from pathlib import Path
from google.adk.agents import LlmAgent

PROMPT_DIR = Path(__file__).parent / "prompts"

rater_agent = LlmAgent(
    name="uc_x_rater",
    model="claude-opus-4-7",
    description="Rates uc-x cases.",
    instruction=(PROMPT_DIR / "rater.md").read_text(),
    tools=[],
    output_key="risk_rating",
)
