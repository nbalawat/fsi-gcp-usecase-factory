---
name: fsi-adk-patterns
description: Live reference for Google ADK API code → imports, decorators, builders, MCP wiring, Memory Bank schemas. Auto-invoked when generating or editing ADK agent code. Refresh from live docs if last_verified > 14 days.
last_verified: 2026-05-04
last_verified_source: existing adk-agent-design skill snapshot (NOT a fresh WebFetch — refresh required before use)
---

# fsi-adk-patterns — live ADK API reference

ADK is evolving. The patterns below were captured from the existing toolkit's `adk-agent-design` skill on 2026-05-04 — but **without** a verified fresh WebFetch. Treat them as a starting point, not authoritative, until refreshed.

This skill exists to keep ADK API code out of the architectural design skills (which discuss *what to build*, not *how the SDK spells it*). When the SDK shifts, only this file needs updating.

## Refresh gate (mandatory before code generation)

Before generating or editing any ADK agent code, check the `last_verified` date in the frontmatter:

| Age | Action |
|---|---|
| ≤ 14 days | Use as-is. |
| > 14 days, ≤ 30 days | Warn the user. Recommend refresh, then proceed. |
| > 30 days | Refuse to generate ADK code until refreshed. |

To refresh, walk the **Refresh checklist** below, WebFetch each URL with the extraction prompt, update the API surface in this file, and bump `last_verified`. Log the refresh in `.fsi-state.json` (created by `/init-use-case`).

## Live doc sources

| URL | Extraction prompt |
|---|---|
| `https://google.github.io/adk-docs/` | "Extract current import paths for `LlmAgent`, `SequentialAgent`, `ParallelAgent`, and the model wrapper classes for Claude and Gemini. Note any deprecated symbols." |
| `https://google.github.io/adk-docs/agents/` | "Extract the current single-agent and supervisor patterns. Note required fields on `LlmAgent`, default values, and the structured-output mechanism." |
| `https://google.github.io/adk-docs/tools/mcp/` | "Extract the current MCP toolset API: how to load from a manifest, how to compose multiple tools, how to handle tool errors." |
| `https://google.github.io/adk-docs/memory/` | "Extract Memory Bank scope values, retention defaults, encryption behavior, and how scope is declared on an agent." |
| `https://google.github.io/adk-docs/eval/` | "Extract the eval harness API and golden-test format." |
| `https://github.com/google/adk-python` | "Search for `class LlmAgent` and capture the current constructor signature; capture `class SequentialAgent` and `class ParallelAgent` as well. Note any new keyword arguments since the snapshot in this skill." |

If a doc URL changes or 404s, update this table — don't fall back to training-data memory of older ADK versions.

## Refresh checklist

When refreshing, verify each of these and update the relevant section:

- [ ] `from google.adk.agents import ...` — class names and module path
- [ ] `from google.adk.models import Claude, Gemini` — model wrapper imports
- [ ] `LlmAgent` constructor: required vs optional fields, current defaults
- [ ] Memory scope values (`session_only` / `session` / `cardholder` / `customer` / `case` / `account`) — additions or renames
- [ ] `from google.adk.tools import AgentTool, McpToolset` — current names
- [ ] Structured output declaration — Pydantic vs schema dict, where it's attached
- [ ] `SequentialAgent` / `ParallelAgent` constructors and `sub_agents` parameter
- [ ] Supervisor pattern — how a parent agent delegates via `AgentTool`
- [ ] Eval harness API — how golden tests are declared and run

## Single-agent pattern (snapshot 2026-05-04)

```python
from google.adk.agents import LlmAgent
from google.adk.models import Claude

agent = LlmAgent(
    name="{use_case}_agent",
    model=Claude("claude-opus-4-7"),
    description="One-sentence what-this-decides for A2A discovery",
    instruction=PROMPT_TEXT,  # from prompts/instruction.md
    tools=[
        ofac_screen_tool,
        velocity_check_tool,
    ],
    memory_scope="cardholder",
    output_key="decision",
)
```

Output must be structured (Pydantic model serialized as JSON), not free text. The schema is part of the agent's contract; the workflow expects a specific shape.

## Supervisor + specialists pattern (snapshot 2026-05-04)

```python
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools import AgentTool

classifier = LlmAgent(
    name="document_classifier",
    model=Gemini("gemini-3-1-flash"),
    instruction=CLASSIFIER_PROMPT,
    output_key="document_types",
)

extractor = LlmAgent(
    name="document_extractor",
    model=Claude("claude-opus-4-7"),
    instruction=EXTRACTOR_PROMPT,
    tools=[document_ai_tool],
    output_key="extracted_fields",
)

eligibility = LlmAgent(
    name="eligibility_checker",
    model=Claude("claude-opus-4-7"),
    instruction=ELIGIBILITY_PROMPT,
    tools=[rules_service_tool, threshold_lookup_tool],
    output_key="eligibility",
)

memo_drafter = LlmAgent(
    name="memo_drafter",
    model=Claude("claude-opus-4-7"),
    instruction=MEMO_PROMPT,
    output_key="memo",
)

analysis = SequentialAgent(
    name="analysis_pipeline",
    sub_agents=[classifier, extractor, eligibility, memo_drafter],
)

supervisor = LlmAgent(
    name="{use_case}_supervisor",
    model=Claude("claude-opus-4-7"),
    instruction=SUPERVISOR_PROMPT,
    tools=[AgentTool(agent=analysis)],
    memory_scope="case",
)

agent = supervisor  # what the workflow calls
```

## MCP tool wiring (snapshot 2026-05-04)

```python
from google.adk.tools import McpToolset

tools = McpToolset.from_manifest("services/atomic/ofac-screen/manifest.json")
```

Every tool the agent can call is an MCP tool. Tools are atomic services exposed via MCP manifests. Agents never call external APIs directly.

## Structured output (snapshot 2026-05-04)

```python
from pydantic import BaseModel, Field
from typing import Literal

class FraudDecision(BaseModel):
    action: Literal["clear", "decline", "step_up", "refer_human"]
    confidence: float = Field(ge=0, le=1)
    reasons: list[str]
    cited_tools: list[str]
```

Attach the schema to the agent (mechanism varies by ADK version — verify on refresh). The workflow consumes this schema. Schema changes are versioned; consumers must update in lockstep.

## Memory scope values (snapshot 2026-05-04)

| Scope | Lifetime | Use for |
|---|---|---|
| `session_only` | Per invocation | Stateless transforms |
| `session` | Per user session | Short-lived chat |
| `cardholder` | Per cardholder | Fraud agents |
| `customer` | Per customer | Relationship-aware agents |
| `case` | Per case ID | Investigations |
| `account` | Per account | Account-scoped operations |

Pick the narrowest scope that supports the use case. Cross-customer memory is forbidden without architecture review (PII isolation requirement). The bank's Memory Bank wrapper handles encryption at rest, retention, and access control.

## What this skill does NOT cover

- **When** to use single vs supervisor → see [adk-agent-design](../adk-agent-design/SKILL.md)
- **How** to write the prompt → see [prompt-author agent](../../agents/prompt-author.md)
- **Which model** for which role → see [model-selection](../model-selection/SKILL.md)
- **Eval tests** structure (golden + adversarial) → see [adk-agent-design](../adk-agent-design/SKILL.md)

This skill is API code only. Architectural and design decisions live in the design-knowledge skills, which won't drift when the SDK changes.
