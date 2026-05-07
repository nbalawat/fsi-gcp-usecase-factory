---
name: fsi-prompt-update
description: "Behavior-change path. Edit REASONS canvas first → identify affected operations → re-run only those builders. Any commit changing runtime behavior must update REASONS in the same PR."
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, python3:*, pytest:*)
---

You are updating a use case's REASONS canvas to reflect a behavior change, then regenerating only the affected artifacts.

## When to invoke

Use this skill when the user wants to:
- Raise / lower a policy threshold
- Swap a model (within approved set)
- Add or remove an agent tool
- Edit an agent prompt
- Change a sink destination
- Add or remove a service
- Change retention / audit / classification

For **pure refactors** (rename, extract function, restructure, no behavior change) use `/fsi-sync` instead.

## Step 1 — Identify the use case

From `$ARGUMENTS` or current branch.

## Step 2 — Read the current REASONS canvas

Open `usecases/<uc>/reasons.yaml`. Confirm with the user the current state of the section they want to change.

## Step 3 — Discuss the change

Ask:

1. **What changes?** (one-line summary)
2. **Which REASONS section?** R / E / A / S / O / N / S
3. **Why?** (regulatory change, policy update, MRM finding, performance issue)
4. **Effective date** if it's a threshold or rule change
5. **Reviewer** (model owner / compliance / MRM) who must sign off

Do not skip this. Behavior changes are versioned and audited.

## Step 4 — Edit REASONS

Apply the change to the canvas. Examples:

- **Threshold**: bump value in Norms section + add an entry to Operations to update Cloud SQL `thresholds` row with new `effective_date`.
- **Model swap**: change `model:` in Structure → agent_archetypes; ensure new model is in approved set.
- **Tool addition**: add MCP tool to Structure → agent_archetypes → tools list; ensure target atomic service exists.
- **Sink change**: edit Structure → sinks; flag any IAM / retention implications in Safeguards.

Validate: `python3 scripts/resolve_reasons_refs.py usecases/<uc>/reasons.yaml`. Every Structure reference must still resolve.

## Step 5 — Identify affected Operations

Walk the canvas's `operations` list. For each, check whether the changed section affects it:

| Section changed | Affected operation kinds |
|---|---|
| Threshold (Cloud SQL row) | `db-seed` operation → re-run schema seed builder |
| Agent prompt | `agent-specialist` or `agent-supervisor` → archetype-builder |
| Agent tools | same as prompt + `agent-validator` re-run |
| Atomic service inputs/outputs | `atomic-service` builder + downstream `workflow-builder` (signature changed) |
| Workflow logic | `workflow-builder` only |
| Compliance regime | `compliance-doc-builder` (regenerate compliance pack) |

Mark each affected operation `dirty: true` in a temp diff (do NOT modify the canvas yet).

## Step 6 — Re-run only the dirty operations

For each `dirty` operation, invoke the corresponding builder subagent with the updated spec from REASONS. The builder is idempotent; it will re-emit the artifact.

```bash
# Example for a threshold change:
python3 scripts/resolve_reasons_refs.py usecases/<uc>/reasons.yaml --layer 1 --filter db-seed
# → invokes the db-seed builder for the affected service
```

## Step 7 — Run gating validators

After each builder finishes, the corresponding validator runs:
- atomic-service-builder → service-validator
- jdm-rule-builder → rule-validator
- agent-specialist-builder → agent-validator
- handler-builder → service-validator (handler mode)

Refuse to proceed if any returns FAIL.

## Step 8 — Run architecture-auditor

The auditor checks for **REASONS ↔ code drift**. After your changes the canvas + the regenerated code must agree. Any drift = the builder under-applied the change. Fix and re-run.

## Step 9 — Update the changelog

Append to `usecases/<uc>/docs/changelog.md`:

```markdown
## <date>
- **Change:** <one-line summary>
- **Section:** <R/E/A/S/O/N/S>
- **Why:** <reason>
- **Effective:** <date>
- **Builders re-run:** <list>
- **Reviewer:** <name+role>
```

## Step 10 — Report

```
DONE /fsi-prompt-update <uc>
  Section changed: <section>
  Operations rerun: <N>
  Validators:      <N> PASS
  Auditor:         PASS / WARN / FAIL
  Reviewer:        <name>
```

## Anti-patterns to refuse

- **Editing generated code without updating REASONS** — `architecture-auditor` blocks the commit. Use this skill or `/fsi-sync`.
- Skipping Step 3 (the discussion). Behavior changes need recorded rationale.
- Promoting straight after a prompt-update without compliance signoff if the change touches a regulatory citation, threshold, or model.
- Lowering a threshold in dev without raising it in prod (config drift).
