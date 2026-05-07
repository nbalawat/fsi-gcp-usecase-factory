---
name: fsi-sync
description: Code-first refactor sync. Re-derive REASONS Structure from current code, diff against the canvas, propose updates for human approval. Use for renames + restructures with no behavior change.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, python3:*)
---

You are synchronising a use case's REASONS canvas to match the current code state — for refactors that don't change behavior.

## When to invoke

Use `/fsi-sync` for:
- Renaming a function inside an atomic service (no behavior change)
- Splitting one atomic service into two (decomposition)
- Reorganising prompts within an agents/ directory
- Bumping a library archetype version (after a non-breaking upgrade)
- Cleaning up dead code that REASONS references

For **behavior changes** use `/fsi-prompt-update` (REASONS-first) instead.

## Step 1 — Identify the use case

From `$ARGUMENTS` or current branch.

## Step 2 — Re-derive Structure from current code

Walk the use case directory and synthesise a Structure block that reflects what's actually on disk:

```bash
# Atomic services this UC uses
find services/atomic -maxdepth 1 -mindepth 1 -type d -exec basename {} \;

# JDM rules this UC uses (per its workflow + rules dir)
find usecases/<uc>/rules -name '*.json' | grep -v tests
find rules -maxdepth 2 -name '*.json' | grep -v tests

# Agent files
find usecases/<uc>/agents -name '*.py' | grep -v __init__

# Sinks
find usecases/<uc>/sinks -maxdepth 1 -mindepth 1 -type d

# Workflow fragments referenced
grep -E "^\s*include:|^\s*template:" usecases/<uc>/workflow.yaml | sort -u
```

For each item, find the version pin (manifest.json `version` field for services, the file's own version for rules, `archetype_ref` in agent manifest.yaml for agents).

## Step 3 — Compare against the canvas

Load `usecases/<uc>/reasons.yaml` Structure section. For each entry:

- **Match found in code** → keep
- **In canvas, not on disk** → flag `removed`
- **On disk, not in canvas** → flag `added`
- **Different version pin** → flag `version_changed`

## Step 4 — Show the diff

Present the diff to the user. Examples:

```
Structure drift detected for credit-memo-commercial:

  added in code:
    services/atomic/insider-screening (manifest v0.1.0)
    [reason: was added without /fsi-prompt-update — re-classify as code-first refactor?]

  removed in canvas:
    libraries/agents/document-extractor@1.0
    [now uses libraries/agents/document-extractor@2.0 per agents/manifest.yaml]

  version changed:
    libraries/workflows/fan-out-join: 1.0 → 1.1
```

Ask the user: **Is this drift the result of a refactor (no behavior change)?**

If **NO** → STOP. The right path is `/fsi-prompt-update`. The drift is real behavior change that bypassed REASONS.

If **YES** → proceed.

## Step 5 — Apply Structure updates to REASONS

For each accepted drift:
- Update Structure list entries (add / remove / version-bump)
- For an **add**, also add an Operation entry (kind matches what's on disk; layer 4 = "post-build sync") so the architecture-auditor sees it
- For a **remove**, also remove the matching Operation entry
- For a version bump, ensure the new library version exists at `libraries/<layer>/<name>/v<new>/` (or marked compatible).

Do NOT touch other REASONS sections (Requirements / Approach / Norms / Safeguards) — those are intent-level and unchanged by a refactor.

## Step 6 — Validate

```bash
python3 scripts/resolve_reasons_refs.py usecases/<uc>/reasons.yaml
```

Every Structure reference must resolve to a real artifact at the pinned version. If anything fails, the refactor is incomplete.

## Step 7 — Run architecture-auditor

The auditor checks REASONS ↔ code alignment. After this skill, drift should be zero. Any remaining flags mean the refactor still has loose ends.

## Step 8 — Append to changelog

```markdown
## <date>
- **Sync:** code-first refactor — no behavior change
- **Structure additions:** <list>
- **Structure removals:** <list>
- **Version pins changed:** <list>
- **Auditor:** PASS
```

## Step 9 — Report

```
DONE /fsi-sync <uc>
  Structure additions: <N>
  Structure removals:  <N>
  Version bumps:       <N>
  Auditor verdict:     PASS
```

## Anti-patterns to refuse

- Using `/fsi-sync` to paper over a real behavior change. If the user can't explain why each drift item is "no behavior change", route them to `/fsi-prompt-update`.
- Adding a Structure entry without a matching Operation. The auditor will find it.
- Removing a Structure entry without verifying it's actually unused (no other UC references it via cross-impact-analyzer).
