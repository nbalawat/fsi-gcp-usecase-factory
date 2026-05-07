---
name: fsi-reuse-report
description: Compute reuse percentage per layer across the portfolio of use cases. Flags atomic services nobody uses (retirement candidates) and shapes built ≥3 times that haven't been promoted (promotion candidates).
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(ls:*, cat:*, find:*, python3:*)
---

You are computing the factory's reuse health metrics.

The factory's targets:
- Use case #2: ≥60% atomic-service reuse
- Use case #5: ≥70% reuse averaged across layers 1-6
- Layer 3 (agent archetypes): ≥3 reuse instances per archetype before promotion

## Step 1 — Read the portfolio registry

Read `portfolio.yaml`. Get the list of use cases.

For each promoted use case, read `usecases/<uc>/reasons.yaml` and extract every Structure reference (the library shapes it consumes) and every `operation` (the new shapes it built).

## Step 2 — Compute layer-by-layer reuse

For each of the six reuse layers:

| Layer | What "reuse" means |
|---|---|
| 1 atomic services | Use case references an existing `services/atomic/<name>/` rather than building a new one |
| 2 JDM rules | Use case uses a shared rule (`rules/<name>/`) rather than authoring a new one |
| 3 agent archetypes | Agent role references `libraries/agents/<archetype>@version` |
| 4 multi-agent patterns | Workflow uses a `libraries/patterns/<pattern>` reference |
| 5 workflow fragments | Workflow `include`s a fragment from `libraries/workflows/` |
| 6 use-case archetypes | UC's `structure.use_case_archetype` field references one |

Per layer:
- **Reused** = count of references to existing library entries
- **New** = count of new shapes built by this UC
- **Reuse %** = reused / (reused + new)

Aggregate across all UCs.

## Step 3 — Identify retirement candidates (Layer 1)

For each `services/atomic/<name>/`, count how many UCs reference it. Flag:
- `0 references` → retirement candidate (orphan service)
- `1 reference` → consider whether it should be inlined into the UC if it's narrow
- `≥3 references` → keep, healthy

## Step 4 — Identify promotion candidates (any Layer 3-6 shape)

For shapes built locally per-UC (Operations of kind `agent-specialist-builder` etc.), look for repetition:

- Same `archetype_ref` declared `null` (i.e., a custom agent built without a library reference) appearing in 3+ UCs with similar manifest fields → promotion candidate
- Same workflow fragment shape inlined in 3+ workflows → promotion candidate

Use simple structural similarity: same `tool_signature`, same `output_key`, similar `prompt_path` tail.

## Step 5 — Compute time series (if available)

If the report has been run before (look for `docs/methodology/reuse_history.md`), compute the trend:

- Per-layer reuse % vs last run
- Library catalog growth (new entries since last run)
- Retirements / removals

## Step 6 — Render the report

```
═══════════════════════════════════════════════════
  Factory reuse report — <date>
  Portfolio: <N> use cases (<M> promoted)
═══════════════════════════════════════════════════

Per-layer reuse:
  Layer 1 (atomic services):    <%> reuse  (<reused>/<reused+new>)
  Layer 2 (JDM rules):          <%>        (<>/<>)
  Layer 3 (agent archetypes):   <%>        (<>/<>)
  Layer 4 (multi-agent patterns): <%>      (<>/<>)
  Layer 5 (workflow fragments): <%>        (<>/<>)
  Layer 6 (use-case archetypes): <%>       (<>/<>)
  ───────────────────────────────────
  Average:                       <%>

Retirement candidates (Layer 1):
  · services/atomic/<name>  — 0 references
  · ...

Promotion candidates (Layer 3-6):
  ★ Custom agent <name> appears in 3 UCs (<list>) — promote to libraries/agents/<name>@1.0?
  ★ Workflow shape <pattern> repeats in 4 UCs — promote to libraries/patterns/<name>@1.0?

Trend (vs last run):
  Layer 1: <prev>% → <now>% (<delta>)
  ...
```

## Step 7 — Append to history

Write the new totals to `docs/methodology/reuse_history.md` so future runs can compute trends.

## Step 8 — Recommend actions

Concrete next steps:

```
RECOMMENDATIONS:
  1. Run /fsi-promote-to-library on <archetype-candidate> — built 4 times, not yet promoted.
  2. Retire services/atomic/<orphan> — no consumers.
  3. Consider parameterising libraries/agents/<archetype>@1.0 — close to satisfying 2 more partial matches.
  4. Layer 4 (patterns) reuse is at 22% — well below 70% target. Promote shared workflow shapes.
```

## Anti-patterns to refuse

- Reporting reuse % without showing the absolute counts. A 100% reuse with N=1 is meaningless.
- Counting "new" shapes that have a library version pinned but the version doesn't actually exist (broken refs).
- Suggesting promotion of shapes built only once.
- Suggesting retirement of an orphan service that has been live for less than one quarter (regression risk).
