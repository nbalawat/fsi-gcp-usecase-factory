---
name: new-agent
description: Scaffold an ADK agent → code + prompts + MCP wiring + Memory Bank scope + manifest + eval + adversarial tests. Supports single-agent and supervisor + specialists.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, pytest:*, ruff:*, mypy:*)
---

You are scaffolding an ADK agent. Output goes to `usecases/{use_case}/agents/`.

## Step 1 — Decide single agent vs inner workflow

Ask: "Does this use case need a single agent (one decision) or an inner agent workflow (multiple specialists)?"

**Single agent when:**
- One model call produces the final decision
- No internal loops or specialist hand-offs
- Examples: gray-zone fraud scoring, single-document classification

**Inner workflow when:**
- Multiple specialist roles (classifier + extractor + reasoner + drafter)
- Specialists retry/refine based on intermediate results
- Different models for different sub-tasks
- Examples: mortgage underwriting, SAR investigation, credit memo

If multi-agent, follow the supervisor pattern in the `adk-agent-design` skill.

## Step 2 — Gather context

Ask the user:

1. Use case the agent serves
2. What decision the agent makes (one sentence)
3. Inputs — what the agent receives from the workflow
4. Output schema — Pydantic model the agent must return
5. Models — which approved model per role (default: Opus 4.7 for reasoning, Gemini 3.1 Flash for high-volume)
6. Tools — list of atomic services or other MCP tools
7. Memory scope — per customer? per case? per session?
8. HITL pattern — auto-route or human review?

## Step 3 — Verify reuse

`ls libraries/agents/` — if a similar archetype exists, instantiate it via the `archetype-builder` rather than creating a new bespoke agent. Some archetypes (document-extractor, narrative-drafter, risk-rater) are bank-wide.

## Step 4 — Verify model selection

Cross-reference with the `model-selection` skill. Refuse models other than `claude-opus-4-7` or `gemini-3-1-flash` unless the user provides an `EXCEPTION:` comment citing architecture-review approval.

## Step 5 — Generate scaffold

Pick the right template:

- **Single agent**: read `references/template_single_agent.md`. Fill in `{placeholders}` from Step 2 context. Write the scaffold to `usecases/{use_case}/agents/{agent_name}.py` plus its `prompts/{agent_name}.md` and `manifest.yaml`.
- **Multi-agent supervisor**: read `references/template_multi_agent.md`. Generate one specialist file per role, plus a supervisor that composes them. Memory scope is set on the supervisor.

Both templates produce manifest fields: `name`, `model`, `data_classification`, `memory_scope`, `tools`, plus a Model Armor stanza.

## Step 6 — Generate eval + adversarial tests

Read `references/template_tests.md`. Produce:

- `usecases/{use_case}/agents/tests/eval_{name}.py` — 5-10 happy-path eval cases with golden outputs.
- `usecases/{use_case}/agents/tests/adversarial/test_adversarial_{name}.py` — at minimum:
  - prompt-injection in document text
  - missing service result
  - inflated-financials trick
  - PII-shaped strings in input
  - threshold-breach forces requires_human_review

## Step 7 — Validate

Run:

```bash
ruff check usecases/{use_case}/agents/
mypy --strict usecases/{use_case}/agents/{agent_name}.py
pytest usecases/{use_case}/agents/tests/ -q
```

Fix any failures before reporting done.

## Step 8 — Architecture audit

Run the `architecture-auditor` subagent against the new agent files. It checks the model is approved, memory scope is declared, tools are listed in the manifest, and prompts have prompt-injection defense.

## Step 9 — Report

```
DONE usecases/{use_case}/agents/{agent_name}.py
  Model:         {model}
  Memory scope:  {scope}
  Tools:         {N}
  Eval cases:    {N}
  Adversarial:   {N}
  Validation:    PASS
```

## Anti-patterns to refuse

- Models other than `claude-opus-4-7` / `gemini-3-1-flash` without an `EXCEPTION:` comment.
- Agents that call atomic services other than via the workflow's `service_results` (pre-computed pattern) or via declared MCP tools.
- Agents without `memory_scope` declared in `manifest.yaml`.
- Agent prompts that contain real PII (SSN, EIN, addresses) — use synthetic placeholders.
- Agents whose output doesn't match the declared Pydantic schema.
