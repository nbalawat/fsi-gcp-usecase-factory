## Step 6 — Generate multi-agent inner workflow scaffold

For inner workflow at `usecases/{use_case}/agents/`:

**agent.py:**

```python
"""
{use_case} agent — multi-agent inner workflow.

Supervisor + specialists pattern. Supervisor decides flow; specialists execute.
"""
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.models import Claude, Gemini
from google.adk.tools import AgentTool
from pathlib import Path

PROMPT_DIR = Path(__file__).parent / "prompts"

# Specialist 1
{specialist_1} = LlmAgent(
    name="{specialist_1_name}",
    model=Gemini("gemini-3-1-flash"),  # fast classifier
    description="{description}",
    instruction=(PROMPT_DIR / "{specialist_1_name}.md").read_text(),
    output_key="{output_key}",
)

# Specialist 2
{specialist_2} = LlmAgent(
    name="{specialist_2_name}",
    model=Claude("claude-opus-4-7"),  # deep reasoning
    description="{description}",
    instruction=(PROMPT_DIR / "{specialist_2_name}.md").read_text(),
    tools=[{tools}],
    output_key="{output_key}",
)

# (Add more specialists)

# Pipeline (sequential composition)
analysis_pipeline = SequentialAgent(
    name="analysis_pipeline",
    sub_agents=[{specialist_1}, {specialist_2}],
)

# Supervisor (decides loop-back, synthesis, escalation)
supervisor = LlmAgent(
    name="{use_case}_supervisor",
    model=Claude("claude-opus-4-7"),
    description="Coordinates {use_case} reasoning across specialist agents.",
    instruction=(PROMPT_DIR / "supervisor.md").read_text(),
    tools=[
        AgentTool(agent=analysis_pipeline),
        # other agents the supervisor delegates to
    ],
    memory_scope="{scope}",
)

# Public agent (what the workflow calls)
agent = supervisor
```

**prompts/supervisor.md:** the supervisor's instruction. Include:
- When to invoke each specialist
- When to loop back if a specialist's output is incomplete
- How to synthesize specialist outputs
- When to return final decision vs. when to escalate to human

Use the prompt-author subagent to draft initial versions.

