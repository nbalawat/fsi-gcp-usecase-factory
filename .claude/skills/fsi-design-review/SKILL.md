---
name: fsi-design-review
description: After /fsi-design-proposals deploys 4 ephemeral UX options, opens the side-by-side comparator HTML page, walks the user through pick + keep/drop/change annotations via AskUserQuestion, promotes the chosen option's components into usecases/<uc>/ui/components/, archives the losers (kept FOREVER for regulator audit), and tears down the losing Cloud Run services. Emits the locked usecases/<uc>/ui/decision.yaml that /init-use-case requires.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, mv:*, cp:*, rm:*, find:*, grep:*, node:*, python3:*, gcloud:*, open:*, git:*), AskUserQuestion
---

You are running Stages 4-7 of the UX-first lockdown. The user already has 4 ephemeral URLs (or 1-3, if some failed). Your job: build the comparator, walk them through the pick, promote the winner, archive the rest.

This skill is the ONLY skill that writes `usecases/<uc>/ui/decision.yaml`. Architecture-auditor refuses any UI commit on a UC without a present and valid decision.yaml.

## Inputs

- `$ARGUMENTS` — kebab-case use case id.
- Flags:
  - `--redo` — overwrite an existing locked decision (requires arch-review override block in the existing decision.yaml or refuses).
  - `--respin` — pick none; spawn 3 new options seeded with prior annotations. iteration_count caps at 1; second use is forbidden without arch-review override.
  - `--static` — build the comparator from local files only (no live URLs); useful for offline review or `--dry-run` proposals.

## Hard preconditions

1. `usecases/<use_case>/ui/proposals/option-{a,b,c,d}/manifest.yaml` exists for at least 1 option (else: tell user to run `/fsi-design-proposals` first).
2. `.fsi-state/<use_case>/proposals/preflight.json` exists with a valid `canvas_sha256`.
3. `usecases/<use_case>/ui/decision.yaml` does NOT exist (or `--redo` is set).
4. The canvas (`onboarding/<use_case>.yaml`) hash still matches `preflight.json: canvas_sha256`. If not, halt: "Canvas changed since proposals were generated. Re-run `/fsi-design-proposals` so the prototypes match the current spec." Stop.

## Stage 4 — Build the comparator (~1 min)

```bash
node scripts/build_design_comparator.mjs <use_case>
# emits usecases/<uc>/ui/proposals/_review.html
```

Read the generated HTML; verify it embeds the URLs you expect from `.fsi-state/<uc>/proposals/<x>.url`. Print the file:// path:

```
Comparator ready. Open it now:
  file:///<repo>/usecases/<uc>/ui/proposals/_review.html

Click through each option's:
  - case-detail screen (the moment-of-truth screen)
  - approval-flow screen (the HITL action surface)

Keyboard: 1/2/3/4 fullscreens each option in a new tab.
```

Optionally invoke `open <path>` (macOS) — but treat that as best-effort; the user may be on Linux/SSH.

## Stage 5 — Pick + annotate (AskUserQuestion)

Before asking, parse each option's `manifest.yaml` and prepare a one-line "tagline" per option for the question's `preview` field. Example:

> Option B · workflow-first metaphor — stages drive layout; current stage is hero (60% viewport); pipeline activity is the spine. Optimised for: traceability, regulator audit. Sacrifices: at-a-glance summary.

**Question 1 — pick.** `AskUserQuestion`:

- `question`: "Which option resonates after click-through? (Per-option taglines below; full rationale + tradeoffs are in the comparator's right strip.)"
- `header`: "Choose"
- `options`: up to 4 labelled "Option A · density", etc. For each option that failed to build/deploy, prefix with "⚠ " and put it last. Add a 5th option `None of these — re-spin (1 use only)` ONLY if `iteration_count == 0` in preflight.

Capture as `chosen_option` (A/B/C/D) OR if user picked "none," set `respin_requested = true` and skip to Stage 6.

**Question 2 — keep / drop.** `AskUserQuestion` (multiSelect):

- `question`: "What should be PRESERVED in the chosen option as the design evolves? (Backend changes that violate these are blocked by lock_level.)"
- `header`: "Keep"
- `options` (4, derived from the chosen option's manifest):
  1. The primary metaphor (e.g. "workflow-first stages drive layout")
  2. The affordance pattern (e.g. "inline-per-section approve/reject")
  3. The information density (e.g. "sparse executive density")
  4. The persona context (e.g. "midnight forensic review")

**Question 3 — drop.** Free-form via `AskUserQuestion` "Other":

- `question`: "What about the chosen option do you want CHANGED before backend builds against it?"
- Tell the user this captures into `decision.yaml: annotations.change[]` with `from / to / reason` shape.

**Question 4 — lock level.** `AskUserQuestion`:

- `question`: "How tightly should the chosen design be locked? Affects when subsequent backend changes force a re-design."
- `header`: "Lock level"
- `options` (3):
  1. `full (Recommended)` — any layout / metaphor / affordance change re-runs design proposals
  2. `layout-only` — metaphor + affordance can evolve; layout is frozen
  3. `metaphor-only` — metaphor frozen; layout + affordance can evolve

## Stage 6 — Re-spin path (only if user picked "none")

If `respin_requested == true`:

1. Verify `iteration_count == 0` (else refuse — escalate to arch-review).
2. Capture user's rationale via `AskUserQuestion`: "Why none? This rationale seeds the next round of agents as constraints."
3. Capture user's positive constraints: "What POSITIVE direction should the new options take? (Even if you couldn't pick, surely some aspects pulled in a good direction.)"
4. Update `.fsi-state/<uc>/proposals/preflight.json: respin_seeds`.
5. Tell user to run: `/fsi-design-proposals <uc> --respin`
6. Stop. Do NOT write decision.yaml.

If user comes back later having run `--respin`, this skill is invoked fresh with options E, F, plus a re-run of one of A-D under the user's positive constraints. iteration_count increments to 1.

## Stage 7 — Promote winner + archive losers (~2-3 min)

Run sequentially (each step depends on the previous):

### 7a — Compute decision.yaml

Build the YAML in memory before writing. Derive every field from canvas + chosen option's manifest + Q1-4 answers. Compute `locked_at` as now-iso. Echo `canvas_checksum` from preflight.

### 7b — Promote chosen option to canonical UI

```bash
# Copy chosen option's tree into usecases/<uc>/ui/components/ + app/
mkdir -p usecases/<uc>/ui/components
mkdir -p usecases/<uc>/ui/app

# Copy components (from option's components/ subtree)
cp -r usecases/<uc>/ui/proposals/option-<chosen>/components/* usecases/<uc>/ui/components/

# Copy app routes (so /init-use-case can wire them into the shell)
cp -r usecases/<uc>/ui/proposals/option-<chosen>/app/* usecases/<uc>/ui/app/

# Copy lib/ if present
test -d usecases/<uc>/ui/proposals/option-<chosen>/lib && \
  cp -r usecases/<uc>/ui/proposals/option-<chosen>/lib usecases/<uc>/ui/

# Symlink mock-data.ts so the promoted code keeps importing it
mkdir -p usecases/<uc>/ui/lib
ln -sf ../proposals/_shared/mock-data.ts usecases/<uc>/ui/lib/mock-data.ts
```

Verify the promoted tree has at least the two routes from the chosen option's `manifest.yaml: routes_implemented`. If not, refuse + halt.

### 7c — Tear down losing Cloud Run services

```bash
for opt in a b c d; do
  if [ "$opt" != "<chosen-lower>" ]; then
    SERVICE="fsi-uc-<uc>-design-$opt"
    if gcloud run services describe "$SERVICE" --region=us-central1 --quiet 2>/dev/null; then
      gcloud run services delete "$SERVICE" --region=us-central1 --quiet
      echo "✓ torn down $SERVICE"
    fi
  fi
done
```

Capture the count into `decision.yaml: telemetry.cloud_run_services_torn_down`.

### 7d — Archive (forever) the losing options + comparator

```bash
TS=$(date -u +"%Y%m%dT%H%M%SZ")
ARCHIVE=usecases/<uc>/ui/proposals/_archive/$TS
mkdir -p $ARCHIVE
mv usecases/<uc>/ui/proposals/_review.html $ARCHIVE/_review.html
for opt in a b c d; do
  if [ "$opt" != "<chosen-lower>" ]; then
    [ -d usecases/<uc>/ui/proposals/option-$opt ] && \
      mv usecases/<uc>/ui/proposals/option-$opt $ARCHIVE/option-$opt
  fi
done
# Keep the WINNER's option directory in place so the audit trail
# captures "which option was promoted from which agent output."
```

Update `decision.yaml: archive_path` with the archive directory.

### 7e — Write decision.yaml (the contract)

```yaml
schema_version: "1.0.0"
use_case_id: <uc>
chosen_option: <A|B|C|D|E|F>
variation_axis: <density|metaphor|affordance|wildcard|respin>
chosen_at: <iso of when user picked>
locked_at: <iso now>
iteration_count: 0  # or 1 if --respin path
lock_level: <full|layout-only|metaphor-only>

annotations:
  keep: [<from Q2 multiSelect>]
  drop: [<from Q3 free-form, parsed>]
  change:
    - from: "<existing>"
      to:   "<desired>"
      reason: "<user's reason>"

rejected_options:
  - option: A
    variation_axis: density
    rationale: "<from manifest.design_summary truncated to 1 line>"
    diversity_score: <pairwise Jaccard vs winner; computed from components_used>
  ...

archive_path: usecases/<uc>/ui/proposals/_archive/<TS>/
comparator_html_path: usecases/<uc>/ui/proposals/_archive/<TS>/_review.html
canvas_checksum: <from preflight>
canvas_path: onboarding/<uc>.yaml

telemetry:
  design_cost_usd: <sum from all 4 manifests' cost.llm_usd + cloud_build_usd>
  design_wallclock_s: <preflight.generated_at → now()>
  respin_cost_usd: 0    # bumped on second pass
  cloud_run_services_torn_down: <count>
```

Validate against `.claude/schemas/ui-decision.schema.yaml` before writing. Refuse to write a malformed decision.

### 7f — Stamp the loser archives' manifests

For each rejected option, append a `rejected: true` field + `rejection_reason` to its archived `manifest.yaml`. This way a regulator reviewing the archive 6 months later can see WHY each option lost.

## Stage 8 — Hand off

Print:

```
═══════════════════════════════════════════════════════════════
  Design locked — <use_case>
═══════════════════════════════════════════════════════════════

  Chosen option       : <X>  (variation: <axis>)
  Lock level          : <full|layout-only|metaphor-only>
  Iteration count     : 0 (or 1 if respin)
  Cloud Run torn down : <count>
  Archive             : <path>  (kept FOREVER for regulator audit)

  Annotations captured:
    keep   : <list>
    drop   : <list>
    change : <count> entries

  Decision contract:
    usecases/<use_case>/ui/decision.yaml

  Promoted UI:
    usecases/<use_case>/ui/components/
    usecases/<use_case>/ui/app/

  Next:
    /init-use-case <use_case>     — scaffolds the rest of the UC
                                    (refuses if decision.yaml is missing
                                    or canvas_checksum drifts)
    /new-use-case + /fsi-build-parallel
                                  — backend code (handler, atomic services,
                                    agents, workflow, sinks). The promoted UI
                                    is the contract; backend layout decisions
                                    must respect annotations.keep.
    /promote <use_case>           — promotion gate (requires signatures
                                    + cross-impact analysis + the archive
                                    trail being intact).
```

## Failure modes

- **All 4 options failed to build/deploy.** Comparator still renders with ⚠ banners; user picks based on rationale.md only or runs `--respin`.
- **User picks an option whose URL is failed.** Allowed — they may be picking based on the static design rationale. Surface a warning: "This option didn't deploy; backend will scaffold against the source code only." Their pick proceeds.
- **Promotion `cp` fails (permissions, etc.).** Halt; don't write decision.yaml; surface the error so the user can fix.
- **Cloud Run teardown fails for a single service.** Continue (don't block the lock); log the failure into telemetry. The nightly cleanup script will mop up.
- **Archive `mv` collides with an existing _archive/<TS>/.** Name with millisecond precision OR refuse with "another design-review ran in this same second; retry."
- **User picks "re-spin" but `iteration_count == 1` already.** Refuse; surface arch-review override path.

## Idempotency

- Re-running on a UC with locked decision.yaml and no `--redo`: refuse, surface "decision is locked; use --redo with arch-review approval."
- Re-running with `--redo` AND existing decision has `iteration_override` block: allowed; bump iteration_count + 1; preserve full prior decision.yaml in the archive.

## Cost / time

- LLM: 0 (this skill is pure orchestration; AskUserQuestion is free)
- Cloud Run teardown: free
- Wall-clock: ~5 min including user pick time

## What this skill does NOT do

- Does NOT generate new design options (that's `/fsi-design-proposals`).
- Does NOT scaffold backend code (that's `/init-use-case`).
- Does NOT modify the canvas (that's `/fsi-prompt-update` after onboarding).
- Does NOT delete archives — those are kept FOREVER.
