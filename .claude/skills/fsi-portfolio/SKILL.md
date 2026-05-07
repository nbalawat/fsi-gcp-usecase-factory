---
name: fsi-portfolio
description: Read or update the FSI use-case portfolio at portfolio.yaml → list, filter, register, advance phase, report reuse % across 100+ use cases.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, yq:*, python:*)
---

# fsi-portfolio — the use-case registry

A single per-use-case repo answers "which use case am I on?" from cwd. The portfolio answers it across 100+ use cases. `portfolio.yaml` at the repo root is the source of truth.

## Subcommands (chosen by user input)

| Subcommand | Action |
|---|---|
| `/fsi-portfolio` (no args) | Print a status table grouped by phase |
| `/fsi-portfolio list <phase>` | List use cases in one phase |
| `/fsi-portfolio show <id>` | Detail view: REASONS summary, owner, libraries consumed, last reviewed |
| `/fsi-portfolio register <id>` | Register a new use case (called automatically by `/init-use-case`) |
| `/fsi-portfolio advance <id> <phase>` | Move to next phase. Called automatically by `/promote`. |
| `/fsi-reuse-report` | Compute atomic-service + archetype + fragment + pattern reuse % across all use cases |

## Phase taxonomy

| Phase | Meaning | Gate to advance |
|---|---|---|
| `intake` | `/init-use-case` ran; REASONS canvas drafted | `/fsi-reasons-review` passes |
| `scaffolded` | `/fsi-build-parallel` produced all artifacts | `/review-uc` passes |
| `piloting` | Deployed to dev/staging GCP | E2E test green for 2 weeks |
| `promoted` | In production | n/a — terminal happy state |
| `retired` | Decommissioned | n/a — terminal end state |

Phases are unidirectional except for `piloting → scaffolded` rollback.

## What's in `portfolio.yaml`

One entry per use case:

```yaml
use_cases:
  - id: credit-memo-commercial          # kebab-case; matches usecases/<id>/
    name: "Human-readable name"
    phase: piloting
    owner:
      team: "Commercial Lending Platform"
      primary_contact: "alice@bank.example.com"
    console_pattern: pipeline-console
    use_case_archetype: pipeline-originator@1.2
    regulatory_regime: ["OCC", "Reg O", "CECL"]
    reasons_path: usecases/credit-memo-commercial/reasons.yaml
    atomic_services_consumed:
      - dscr-calculator@2.1
      - financial-spreader@1.4
    agent_archetypes_consumed:
      - document-extractor@2.0
      - narrative-drafter@1.5
    workflow_fragments_consumed:
      - fan-out-join@1.0
      - approval-gate@1.2
    last_reviewed: "2026-05-04"
```

## Step 1 — Read current state

```bash
yq '.use_cases | length' portfolio.yaml         # how many UCs
yq '.use_cases[] | select(.phase == "piloting")' portfolio.yaml
```

If `portfolio.yaml` is missing or fails schema validation, refuse to write any entry — escalate.

## Step 2 — Render the status table (default invocation)

Group by phase. For each phase, print: id, owner.team, console, last_reviewed. Counts at top.

## Step 3 — Register a new use case (`register` subcommand)

1. Confirm `usecases/<id>/reasons.yaml` exists and validates against `policies/reasons_schema.json`.
2. Extract: console_pattern from `structure.console_pattern`; archetype from `approach.use_case_archetype`; regulatory regime from `requirements.regulatory_regime`; libraries consumed from `structure.*`.
3. Append entry with `phase: intake` (or `scaffolded` if `/fsi-build-parallel` already ran).
4. Update `last_updated` at top of `portfolio.yaml`.
5. Commit on a branch — never auto-push.

Idempotent: re-registering an existing id updates instead of duplicating.

## Step 4 — Advance a phase (`advance` subcommand)

1. Validate the destination phase is one step forward (or `scaffolded` rollback from `piloting`).
2. Run the gate check for the new phase (e.g. `advance scaffolded` requires `/review-uc` to have passed within the last 7 days; check git log for the audit commit).
3. Update phase + `last_reviewed`. Commit.

## Step 5 — Reuse report (`/fsi-reuse-report`)

Walks every `usecases/*/reasons.yaml`, sums library references per layer, divides by total reference slots:

```
Layer                         | Library entries | Total uses | Avg uses/entry
------------------------------|-----------------|------------|---------------
Atomic services               | 24              | 187        | 7.8
Agent archetypes              | 9               | 41         | 4.6
Multi-agent patterns          | 3               | 12         | 4.0
Workflow fragments            | 8               | 96         | 12.0
Use-case archetypes           | 5               | 18         | 3.6
Console patterns              | 6               | 18         | 3.0
```

Top reused services and archetypes are listed below the table.

**Rule of three trigger:** any library entry with `Total uses == 2` and a third use case currently in `intake` phase generates a "promote-to-canonical" recommendation. The `cross-impact-analyzer` subagent reads the report and surfaces these.

## Anti-patterns to refuse

- Manual edits to `portfolio.yaml` outside this skill — git-blame should show only `/fsi-portfolio` commits
- Phase advances without the gate check passing
- Library references in registry that don't pin a version (`document-extractor` instead of `document-extractor@2.0`)
- Use cases registered without a `reasons.yaml` — registry must reference REASONS, not duplicate it

## Cross-references

- [policies/reasons_schema.json](../../../policies/reasons_schema.json) — REASONS contract
- [.claude/skills/fsi-reasons-canvas/SKILL.md](../fsi-reasons-canvas/SKILL.md) — REASONS authoring
- [docs/methodology/methodology.md](../../../docs/methodology/methodology.md) — five-layer enforcement model
