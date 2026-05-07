---
name: new-use-case
description: Scaffold a complete use case end-to-end → REASONS canvas → 5-step paradigm → reuse libraries → directory structure → builder fan-out. Verifies architecture before committing.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, find:*)
---

You are scaffolding a new use case end-to-end. Output goes to `usecases/{use_case_id}/`.

## Step 1 — Read the project context

Read `CLAUDE.md`, `portfolio.yaml`, `docs/methodology/architecture.md`. Confirm the directory layout (framework at root, use cases under `usecases/<id>/`).

## Step 2 — Diagnostic questions

1. **Use case name** — kebab-case
2. **One-sentence description** — what business problem does this solve?
3. **Trigger** — what event or schedule starts this?
4. **Outcome** — what does success look like?
5. **Primary user** — who reviews / acts on the output?
6. **Regulatory regime** — OCC / BSA / Reg E / CECL / SR 11-7 / etc.
7. **Latency budget** — sub-second, hours, or days?

## Step 3 — Pick the console pattern

Map the time-horizon + unit-of-work to one of six consoles:

| Console | When |
|---|---|
| real-time | Sub-second decisions, throughput-dominant |
| investigations | Case-level investigation with regulatory clocks |
| pipeline | Multi-day flow through stages |
| surveillance | 2D state grid, continuous re-evaluation |
| run | Periodic exercise toward a deadline |
| recommendations | Agent suggestions queued for human disposition |

If unsure, read `docs/methodology/console_reference.md`.

## Step 4 — Inventory reusable assets

Read `references/inventory_checklist.md`. Walk through all six reuse layers:

1. Atomic services (`services/atomic/`)
2. JDM rules (`rules/`)
3. Agent archetypes (`libraries/agents/`)
4. Multi-agent patterns (`libraries/patterns/`)
5. Workflow fragments (`libraries/workflows/`)
6. Use-case archetypes (`libraries/use-cases/`)

For each match, record `name@version` for the REASONS Structure section. Reuse target: ≥60% of services.

## Step 5 — Decide on inner agent workflow

Single agent vs supervisor + specialists. The `adk-agent-design` skill auto-loads when you start authoring agent files.

## Step 6 — Identify HITL pattern

ambient | notify | approval-gate | copilot | conversational. Pick one. The console pattern from Step 3 already implies most of this.

## Step 7 — Generate the directory structure

Read `references/template_directory_structure.md`. Create the full `usecases/{use_case_id}/` tree with placeholder files for every component. The layout follows the rule "everything for one use case lives in one directory" (see CLAUDE.md).

## Step 8 — Write the REASONS canvas

Use the `fsi-reasons-canvas` skill to author `usecases/{use_case_id}/reasons.yaml`. Every Operation gets a `layer` (1–4) so the parallel-build orchestrator knows the DAG.

## Step 9 — Delegate to specialist subagents

The REASONS Operations drive the builders. The `fsi-build-parallel` skill orchestrates them:

- Layer 1: handler-builder + atomic-service-builder × N + jdm-rule-builder × N (parallel)
- Layer 2: agent-supervisor-builder + agent-specialist-builder × N (parallel; depends on Layer 1 manifests)
- Layer 3: workflow-builder + terraform-author + e2e-test-builder (parallel; depends on Layer 2 contracts)
- Layer 4: compliance-doc-builder + console-config-builder + demo-data-builder (parallel; independent)

## Step 10 — Run validation

```
scripts/lint_toolkit.sh
scripts/validate_use_case.sh {use_case_id}
make test-services
```

## Step 11 — Architecture audit

Run the `architecture-auditor` subagent against the new use case. Address every BLOCKER finding before committing.

## Step 12 — Generate the use case spec document

Read `references/template_spec_doc.md`. Write `usecases/{use_case_id}/docs/spec.md`.

## Step 13 — Final report

```
DONE usecases/{use_case_id}/
  Console:           {pattern}
  REASONS canvas:    7 sections complete
  Reuse percentage:  {%} (target: ≥60%)
  Operations:        {N} across 4 layers
  Validation:        PASS
  Next step:         /fsi-build-parallel {use_case_id}
```

## Anti-patterns to refuse

- Use-case files anywhere except `usecases/{id}/` — root layers are framework only.
- Custom UI code — every UC configures one of the six consoles via `ui/console.yaml`.
- Models other than `claude-opus-4-7` / `gemini-3-1-flash`.
- Rules without regulatory citations or golden tests.
- Skipping reuse inventory — `/new-use-case` is meaningless without it.
