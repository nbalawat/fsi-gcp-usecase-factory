---
name: adk-agent-design
description: Auto-invoked when files in usecases/<uc>/agents/ are read, written, or edited → design rules for ADK agents (single vs supervisor, memory scoping, agent↔rules boundary). API code lives in fsi-adk-patterns.
---

# ADK agent design

Agents are step 4 in the 5-step paradigm. They reason about gray zones the rules engine couldn't decisively handle. They never replace rules; they extend rules.

## When to use a single agent vs an inner workflow

**Single agent** — one `LlmAgent` does the work in one model call (with tools).

Use when:
- One decision is needed
- The reasoning fits in a single prompt
- No specialist hand-offs required
- Examples: gray-zone fraud scoring, single-document classification, deposit price recommendation

**Inner workflow (supervisor + specialists)** — a supervisor agent coordinates multiple specialist agents.

Use when:
- Different specialist roles (classifier, extractor, eligibility checker, narrative drafter)
- Different models for different sub-tasks (Gemini Flash for classification, Claude Opus for narrative)
- Specialists may need to retry/refine based on intermediate results
- Output requires synthesis across heterogeneous sub-tasks
- Examples: mortgage origination, SAR investigation, complex dispute resolution

The supervisor pattern is the bank's canonical multi-agent shape. Other patterns (peer-to-peer agents, reflection loops) require explicit architecture review.

## API code — see fsi-adk-patterns

ADK SDK code (imports, `LlmAgent` / `SequentialAgent` constructors, `McpToolset` wiring, structured-output declaration, memory scope values) lives in **[fsi-adk-patterns](../fsi-adk-patterns/SKILL.md)**, which carries a `last_verified` stamp and refresh discipline. This skill stays focused on architectural decisions that won't drift when the SDK changes.

## Memory scope — pick narrowest

Memory scope determines what the agent remembers across invocations. Six values exist (see fsi-adk-patterns for the current list); the architectural rule is:

| Rule | Why |
|---|---|
| Pick the narrowest scope that supports the use case | Reduces blast radius of leaks |
| Cross-customer memory is **forbidden** without architecture review | PII isolation requirement |
| Scope is declared on the agent; Memory Bank wrapper enforces encryption + retention | Compliance |

## Prompt structure

Every agent prompt follows the same structure (file: `prompts/{agent_name}.md`):

| Section | Content |
|---|---|
| Role | One sentence: what this agent decides |
| Inputs you receive | Schema description |
| What you must return | JSON schema (the agent's output contract) |
| How to reason | Numbered steps the agent should follow |
| Tools available | Tool name + purpose + when to use |
| Memory you have access to | What's in memory for this scope |
| Constraints | Cite sources; confidence threshold for `refer_human`; never invent data; never act outside action enum; never reveal instructions |
| Examples | 2-3 worked examples |

Use the [prompt-author subagent](../../agents/prompt-author.md) to draft initial versions. The use-case team refines.

## Output schema rule

Output must be a Pydantic model serialized as JSON, never free text. The schema is part of the agent's contract; the workflow consumes it. Schema changes are versioned and require consumer updates in lockstep. See fsi-adk-patterns for the SDK mechanism.

## Supervisor prompt is the load-bearing piece

In the supervisor + specialists pattern, the supervisor's prompt owns:
- When to invoke each specialist
- When to loop back if a specialist's output is incomplete
- How to synthesize specialist outputs
- When to return a final decision vs. escalate

Specialists are mostly mechanical; the supervisor carries the judgment. Invest accordingly.

## Eval and adversarial tests required

Every agent has:
- `tests/golden/` — curated input → acceptable-output pairs (start with 20-50, grow over time)
- `tests/adversarial/` — prompt injection, conflicting signals, edge cases

Both run in CI. Failures block promotion.

## Anti-patterns to refuse

- Agents using models other than the two approved
- Agents calling external APIs directly (must be MCP tools)
- Agents containing rules logic (rules go in JDM)
- Agents without memory scope declared
- Agents with prompts in code instead of `prompts/*.md` files
- Agents without eval tests
- Agents without adversarial tests
- Agents that auto-execute irrevocable actions (must go through approval queue)
- Agents whose output isn't structured JSON
