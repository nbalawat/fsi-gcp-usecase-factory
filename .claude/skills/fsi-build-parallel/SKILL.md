---
name: fsi-build-parallel
description: Orchestrate a parallel DAG build of a use case from reasons.yaml → fan out Layer-1 builders → QA validate → Layer 2 → QA validate → Layer 3 → /review-uc.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(ls:*, cat:*, python3:*, git:*)
---

You are the parallel-build orchestrator for a use case defined by a REASONS canvas.

## Step 1 — Locate and validate the canvas

```bash
python3 scripts/resolve_reasons_refs.py usecases/<name>/reasons.yaml
```

If any refs are FAIL (not just DEFERRED), stop and report. Do not start builders until refs are 0 unresolved.

## Step 2 — Parse operations by layer

Read `usecases/<name>/reasons.yaml`. Collect all entries under `operations:`, grouped by `layer`.

```
Layer 1 (leaves): handler, atomic-service, jdm-rule, demo-data, compliance-doc
Layer 2 (agents): agent-specialist, agent-supervisor
Layer 3 (wiring): workflow, terraform, console-config, e2e-test
Layer 4 (gates):  architecture-auditor, compliance-reviewer, security-reviewer
```

## Step 3 — Fan out Layer 1 (parallel)

Launch one Agent call per Layer-1 operation in a **single message** (all calls in parallel):

| Operation kind    | Builder subagent           | Key inputs from spec              |
|-------------------|---------------------------|-----------------------------------|
| `handler`         | `handler-builder`         | trigger_topic, enrichments        |
| `atomic-service`  | `atomic-service-builder`  | inputs, outputs, path             |
| `jdm-rule`        | `jdm-rule-builder`        | inputs, outputs, path             |
| `demo-data`       | `demo-data-builder`       | borrowers, include, domains       |
| `compliance-doc`  | `compliance-doc-builder`  | framework, derived_from, path     |

Each builder receives: `use_case_id`, `operation.id`, `operation.path`, `operation.spec`.

Wait for all Layer-1 agents to complete before proceeding.

## Step 4 — QA validate Layer 1 (parallel)

**Do not skip this step.** Run one validator per built artifact in a **single message** (all in parallel).

| Built artifact type | Validator subagent   | Inputs to pass                                          |
|---------------------|---------------------|---------------------------------------------------------|
| `atomic-service`    | `service-validator` | use_case_id, operation_id, operation_path, service_type="atomic-service", spec.inputs, spec.outputs |
| `handler`           | `service-validator` | use_case_id, operation_id, operation_path, service_type="handler", spec.inputs, spec.outputs |
| `jdm-rule`          | `rule-validator`    | use_case_id, operation_id, operation_path, golden_tests_path, spec.inputs, spec.outputs, spec.hit_policy |

`demo-data` and `compliance-doc` operations do not require QA validation at this layer.

**Join rule:** Collect all validator verdicts before advancing.
- If any validator returns **FAIL** → stop; report all failures; do not start Layer 2.
- If any validator returns **WARN** → record warnings in the final report; proceed to Layer 2.
- Only if all validators return **PASS** or **WARN** → advance to Step 5.

Partial failure: if only some operations fail validation, the failing operations must be repaired and revalidated before Layer 2 starts. Passing operations' outputs are preserved.

## Step 5 — Fan out Layer 2 (parallel)

Launch all `agent-specialist` and `agent-supervisor` builder agents in parallel:

| Operation kind      | Builder subagent              |
|---------------------|------------------------------|
| `agent-specialist`  | `agent-specialist-builder`   |
| `agent-supervisor`  | `agent-supervisor-builder`   |

Each specialist builder receives:
- The manifest list from Layer 1 validated atomic services (tool contracts)
- The operation spec from `reasons.yaml`

Each supervisor builder receives:
- The list of specialist operation IDs and their output_keys
- The multi-agent pattern name from `reasons.yaml` structure section

Wait for all Layer-2 agents to complete.

## Step 6 — QA validate Layer 2 (parallel)

**Do not skip this step.** Run one `agent-validator` per built agent in a **single message**:

| Built artifact type | Validator subagent  | Inputs to pass                                                        |
|---------------------|---------------------|-----------------------------------------------------------------------|
| `agent-specialist`  | `agent-validator`   | use_case_id, operation_id, operation_path, agent_type="specialist", spec.archetype, spec.model, spec.memory_scope, spec.tools, spec.output_key |
| `agent-supervisor`  | `agent-validator`   | use_case_id, operation_id, operation_path, agent_type="supervisor", spec.archetype, spec.model, spec.memory_scope, spec.tools |

**Join rule:** Same as Step 4.
- If any validator returns **FAIL** → stop; report all failures; do not start Layer 3.
- If any validator returns **WARN** → record warnings; proceed to Layer 3.
- Only if all validators return **PASS** or **WARN** → advance to Step 7.

## Step 7 — Fan out Layer 3 (parallel)

Launch workflow, terraform, console-config, and e2e-test builders in parallel:

| Operation kind    | Builder subagent           |
|-------------------|---------------------------|
| `workflow`        | `workflow-builder`        |
| `terraform`       | `terraform-author`        |
| `console-config`  | `console-config-builder`  |
| `e2e-test`        | `e2e-test-builder`        |

Wait for all Layer-3 agents to complete.

## Step 8 — Run /review-uc (gatekeepers)

After all three layers build and their QA validators pass, invoke the holistic review:

```
Use architecture-auditor, compliance-reviewer, and security-reviewer subagents in parallel.
Pass them the full use case directory.
```

These gatekeepers look at the whole use case together — cross-cutting architecture, compliance completeness, security posture. They complement the per-builder validators (which check individual contracts) — they are not redundant.

Report each verdict. FAIL blocks promotion; WARN is flagged for the team.

## Step 9 — Report

```
/fsi-build-parallel <use_case_id> complete
  Layer 1: <N> operations built, <N> validated (PASS: <n>, WARN: <n>, FAIL: <n>)
  Layer 2: <N> agents built, <N> validated (PASS: <n>, WARN: <n>, FAIL: <n>)
  Layer 3: <N> wiring artifacts built
  Architecture audit: PASS / WARN / FAIL
  Compliance review:  PASS / WARN / FAIL
  Security review:    PASS / WARN / FAIL
  Warnings to resolve before /promote:
    - <operation_id>: <warning text>
  Elapsed (wall): <T>
```

## Discipline rules

- Never start Layer N+1 until Layer N has built **and** QA-validated successfully.
- Builders write to distinct paths from the `operation.path` field — no two operations share a path.
- QA validators run inline at each join point — not after the full build, not alongside builders.
- Gatekeepers (architecture-auditor, compliance-reviewer, security-reviewer) run after the full build (Step 8), never alongside builders or validators.
- On partial failure at a join: report failing operations + their validator output. Passing operations' outputs are preserved. Repair the spec/builder, rerun only the failed operation's builder + validator.
- Running a builder or validator twice for the same operation is safe — both are idempotent.
- Warnings accumulate and are reported at the end. They do not block the build but block `/promote` if unresolved.
