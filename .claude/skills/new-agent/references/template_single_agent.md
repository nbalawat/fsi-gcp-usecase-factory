## Step 5 — Generate single-agent scaffold

For a single agent at `usecases/{use_case}/agents/`:

**agent.py:**

```python
"""
{use_case} agent.

{One-sentence description of what this agent decides.}
"""
from google.adk.agents import LlmAgent
from google.adk.models import Claude, Gemini
from pathlib import Path
from .tools import {list of MCP tool imports}
from .memory import memory_scope_loader

PROMPT_DIR = Path(__file__).parent / "prompts"

# Primary agent
agent = LlmAgent(
    name="{use_case}_agent",
    model={Claude("claude-opus-4-7") | Gemini("gemini-3-1-flash")},
    description="{one-sentence description for A2A discovery}",
    instruction=(PROMPT_DIR / "instruction.md").read_text(),
    tools=[
        {tool_1},
        {tool_2},
        # ...
    ],
    memory_scope="{scope}",  # "cardholder" | "customer" | "case" | "session"
    output_key="decision",
)

# Fallback (if primary times out or errors)
fallback_agent = LlmAgent(
    name="{use_case}_agent_fallback",
    model={fallback model},
    instruction=(PROMPT_DIR / "instruction.md").read_text(),
    tools=[{same tools}],
    memory_scope="{scope}",
    output_key="decision",
)
```

**prompts/instruction.md:**

```markdown
# {use_case} agent — instruction

You are an agent in the bank's agentic banking platform. You make decisions about {what}.

## Inputs you receive
{from user}

## What you must return
A JSON object matching this schema:
```json
{output schema}
```

## How to reason
1. {step 1 of expected reasoning}
2. {step 2}
3. ...

## Tools you can call
- {tool_1}: {when to use}
- {tool_2}: {when to use}

## Memory you have access to
{memory description}

## Constraints
- Always cite your sources (which tool calls informed which conclusions)
- Confidence below 0.6 → return "refer_human" instead of a definitive action
- Never invent data; if a tool fails, say so and reduce confidence
- Never recommend an action outside the action enum
```

The skill leaves the prompt as a starting point. The user (with prompt-author subagent help) refines it.

**memory.py:** wires Memory Bank scope.

**manifest.yaml:** A2A capability manifest.

```yaml
agent_id: {use_case}_agent
version: 1.0.0
description: {description}
framework: adk
endpoint: https://agent-runtime-{env}.run.app/agents/{use_case}_agent
input_schema_ref: ./input_schema.json
output_schema_ref: ./output_schema.json
models:
  primary: claude-opus-4-7
  fallback: {fallback model}
memory_scope: {scope}
mcp_tools:
  - {tool_1}
  - {tool_2}
governance:
  data_classification: {PII level}
  observability_endpoint: {OTel endpoint}
```

