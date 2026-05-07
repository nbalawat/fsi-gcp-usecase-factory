---
name: init-use-case
description: Initialize a new use case repository with the bank's standard layout. Creates CLAUDE.md, .claude/settings.json, the directory tree, dependency manifest skeleton, and SLO file. Use this BEFORE /new-use-case when starting from a fresh empty repo.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash(git:*, mkdir:*, ls:*, cat:*, touch:*)
---

You are initializing a new use case repository.

## Step 1 — Confirm context

If the user hasn't provided a use case name as `$ARGUMENTS`, ask:

"What is this use case? Give me a short name (kebab-case) and a one-sentence description."

Example response:
- Name: `complaint-triage`
- Description: "Triage incoming complaints across CFPB, call center, and digital channels."

## Step 2 — Verify empty/clean repo

Run `ls -la`. If the repo already has substantial content, stop and ask:

"This repo already has files. Do you want me to:
(a) Add the bank's structure alongside existing files?
(b) Stop and let you back up first?"

If empty (only `.git/` and maybe a README), proceed.

## Step 3 — Create the directory tree

```bash
mkdir -p services/handlers
mkdir -p services/atomic
mkdir -p services/sinks
mkdir -p agents
mkdir -p workflows
mkdir -p rules
mkdir -p infra/modules
mkdir -p infra/environments/dev
mkdir -p infra/environments/staging
mkdir -p infra/environments/prod
mkdir -p infra/use_cases
mkdir -p ui/use_cases
mkdir -p tests/e2e
mkdir -p tests/golden
mkdir -p tests/adversarial
mkdir -p docs/use_cases/{use_case_id}/compliance_pack
mkdir -p .claude
mkdir -p reference
```

Add `.gitkeep` to empty directories so git tracks the structure.

## Step 4 — Create CLAUDE.md

Copy `${CLAUDE_PLUGIN_DIR}/CLAUDE.md` to repo root, then append:

```markdown

## This project

- Use case ID: {use_case_id}
- Description: {one-sentence description from user}
- Created: {today's date}
- Status: scaffolding (not yet ready for promotion)

When starting work, run `/new-use-case` to scaffold the full structure.
```

## Step 5 — Create .claude/settings.json

```json
{
  "extends": "agentic-banking-platform"
}
```

Tells Claude Code to inherit the platform plugin in this project.

## Step 6 — Create initial use case docs

`docs/use_cases/{use_case_id}/spec.md`:

```markdown
# {Use case ID} — specification

## Description
{user-provided one-sentence description}

## Status
Scaffolding. Run /new-use-case to generate the full implementation skeleton.

## Open questions
- Trigger events?
- Primary human user?
- Regulatory frameworks?
- Latency budget?
- Console pattern?

This file gets filled in by /new-use-case.
```

`docs/use_cases/{use_case_id}/dependencies.yaml`:

```yaml
# What this use case consumes and produces.
# Used by the cross-impact-analyzer to compute test impact.
consumes:
  topics: []
  services: []
  shared_agents: []
  bigquery_tables: []
produces:
  topics: []
  bigquery_tables: []
```

`docs/use_cases/{use_case_id}/slos.yaml`:

```yaml
# Service level objectives for this use case.
# Asserted by the synthetic load runner before promotion.
latency:
  p50_ms: 0    # fill in
  p95_ms: 0
  p99_ms: 0
error_rate:
  budget_pct: 0.5
decision_distribution:
  baseline: {}    # fill in baseline distribution after first prod run
  drift_threshold_pct: 5
agent:
  cost_per_decision_usd_max: 0  # fill in
  tokens_per_decision_max: 0    # fill in
```

## Step 7 — Initialize git if needed

```bash
if [ ! -d .git ]; then
  git init
  git add -A
  git commit -m "Initial scaffold for {use_case_id} use case"
fi
```

If git is already initialized, just `git add -A` to stage the new files.

## Step 8 — Confirm and prompt next step

Output:

```
✓ Repository initialized for use case: {use_case_id}
  Directory structure created
  CLAUDE.md installed (extends platform plugin)
  Initial use case docs scaffolded

Next: run /new-use-case to scaffold the full implementation.
```
