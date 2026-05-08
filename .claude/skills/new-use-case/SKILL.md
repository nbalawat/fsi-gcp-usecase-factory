---
name: new-use-case
description: Scaffold a complete use case end-to-end → REASONS canvas → 5-step paradigm → reuse libraries → directory structure → builder fan-out. Verifies architecture before committing.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, find:*)
---

You are scaffolding a new use case end-to-end. Output goes to `usecases/{use_case_id}/`.

## Step 1 — Read the project context

Read `CLAUDE.md`, `portfolio.yaml`, `docs/methodology/architecture.md`,
and **`docs/methodology/product-build-discipline.md`** (the don't-repeat
list — every Step 2 question below traces to a specific rule in that
doc). Confirm the directory layout (framework at root, use cases under
`usecases/<id>/`).

## Step 2 — Diagnostic questions

### 2A. Business framing

1. **Use case name** — kebab-case
2. **One-sentence description** — what business problem does this solve?
3. **Trigger** — what event or schedule starts this?
4. **Outcome** — what does success look like?
5. **Primary user** — who reviews / acts on the output?
6. **Regulatory regime** — OCC / BSA / Reg E / CECL / SR 11-7 / etc.
7. **Latency budget** — sub-second, hours, or days?

### 2B. Discipline gates (each maps to a rule in product-build-discipline.md)

These are **mandatory** at scaffold time. Answers go into
`reasons.yaml#discipline_gates`. Skipping these creates the bugs we
already paid for on credit-memo-commercial.

8. **Model provider per agent role** — Vertex Gemini ADC (recommended for
   GCP-native), Anthropic API key, or both with a feature flag? What auth
   mechanism (ADC, key from Secret Manager)? What region for co-location?
   *(Rule 1 — locks the provider; prevents "I thought we were using ADK"
   pivots mid-build.)*

9. **Structured-output agents** — list every agent that emits JSON
   consumed by downstream code. Each one MUST set `response_schema` on
   its provider call.
   *(Rule 2 — prevents the `credit_memorandum_draft` wrapper class of bug;
   prompt-only constraint demonstrably does not hold.)*

10. **Stub-mode UX** — when an agent or service is unavailable, what does
    the user see? (Required: degraded banner + `synthesized: true` flag +
    e2e smoke fails on any stub.)
    *(Rule 3 — silent stubs are worse than failures.)*

11. **Data layer** — at scaffold time:
    - **(a) Simulator publishing to deployed pipeline** (recommended for
      demo-grade), or
    - **(b) Live source adapter**, or
    - **(c) Fixtures (PoC only)** — if c, what date does the
      fixture-removal commit ship?
    *(Rule 4 — no mock data past day 1.)*

12. **Persona count** — how many user roles (RM, analyst, underwriter,
    CCO, compliance)? List them now; the persona switcher and home views
    are scaffolded from the first PR.
    *(Rule 18 — retrofitting personas costs 3×.)*

13. **Long-running services** — does any service in the critical path
    take >60s P99? List them; their `--timeout` will be set to P99 × 1.5
    in `scripts/deploy_service.sh`.
    *(Rule 21 — default 540s timeout kills multi-LLM pipelines.)*

14. **Idempotency keys** — what's the idempotency key for this use case
    (typically `application_id` or equivalent)? What stage value
    indicates "already running, do not restart"?
    *(Rule 7 — Pub/Sub WILL redeliver; without the guard, the full
    pipeline runs twice.)*

15. **Required env vars** — list every env var the services require to
    boot (project, region, secrets). Each will get an `_assert_env([...])`
    call before main initialization.
    *(Rule 20 — silent skip on missing project produced an hour-long
    "page is hung at Application Received" debugging session.)*

16. **Banker-readable schema fields** — list every schema field whose
    value is rendered as prose to a user (`executive_summary.text`,
    `recommendation.narrative`, etc.). Each gets a `banker_readable: true`
    flag in the schema; the validator rejects values that look like JSON.
    *(Rules 8, 9, 10 — never dump intermediate state into user-facing
    fields; never truncate forensics.)*

17. **Demo simulator** — does this use case need a demo simulator? If
    yes, how many fixture profiles, what cadence, what scenario tags?
    *(Rule 22 — click-driven demos rarely impress; simulators double as
    regression load-shape tests.)*

18. **UX checklist commitment** — confirm every UI page in this use case
    will satisfy `docs/demo/ux-acceptance-checklist.md` (loading / empty
    / error / populated states + motion + keyboard nav + density modes).
    *(Rule 12, 26 — UX retrofit cost is 3× build-in cost.)*

If the team cannot answer questions 8–18, do NOT proceed to Step 3 —
those decisions belong at scaffold time, not retrofit time.

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

Each pattern below has cost real time on a prior use case; the rule
number references `docs/methodology/product-build-discipline.md`.

### Architectural (refuse outright)

- Use-case files anywhere except `usecases/{id}/` — root layers are framework only.
- Custom UI code — every UC configures one of the six consoles via `ui/console.yaml`.
- Models other than `claude-opus-4-7` / `gemini-3-1-flash`.
- Rules without regulatory citations or golden tests.
- Skipping reuse inventory — `/new-use-case` is meaningless without it.

### Data-flow (block at scaffold)

- **Static demo data past day 1** — `demo-data/scenarios/*.json` as a
  runtime data source. (Rule 4)
- **`json.dumps()` into user-facing tables** — banker-readable fields
  must be banker prose, never serialized internal state. (Rules 8, 9)
- **Truncation `[:NNNN]` on forensic outputs** — destroys the artifact
  you'd need to debug. (Rule 10)
- **Synthesizer fallbacks that don't validate** — an unvalidated
  fallback puts the user in a half-broken state with no recovery path.
  (Rule 11)

### Agent / LLM (block at scaffold)

- **Structured-output agents without `response_schema`** — prompt-only
  constraint demonstrably does not hold for wrapper / alt-key drift.
  (Rule 2)
- **Silent stub fallbacks** — agents falling back to stubs without
  surfacing `synthesized: true` and a degraded banner. (Rule 3)
- **Risk-band / decision enums coerced ad-hoc** — every enum has one
  canonical form, coerced at the boundary. (Rule 25)

### Deploy / ops (block at scaffold)

- **Default 540s Cloud Run timeout** for any service that calls multiple
  LLMs or long-running atomic services. (Rule 21)
- **Async handlers without idempotency guard** — Pub/Sub redelivery
  will double-run the pipeline. (Rule 7)
- **Silent skip on missing required env vars** — every service must
  hard-fail at boot. (Rule 20)

### UI (block at scaffold)

- **Polling on case-state queries** — use SSE; `setInterval(fetch)` is a
  load amplifier and a staleness source. (Rule 13)
- **Server Components that don't subscribe to SSE invalidation** — the
  page will get stuck on stale state. (Rule 15)
- **`Intl.NumberFormat` for SSR-rendered numbers** — ICU divergence
  produces hydration errors; use a hand-rolled shared formatter.
  (Rule 16)
- **Sections without `<SectionErrorBoundary>` / null-safe defaults** —
  schema drift will crash the page. (Rule 14)
- **Platform jargon ("5-step paradigm", "atomic services") in user
  text** — UI strings are linted against a per-use-case banned-terms
  list. (Rule 17)
- **Personas retrofitted later** — scaffold the persona switcher in
  PR #1. (Rule 18)
- **Loading / empty / error / populated states "to add later"** — all
  four states ship with PR #1 of every UI page. (Rules 12, 26)
