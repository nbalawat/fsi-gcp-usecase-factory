# agentic-banking-platform

Claude Code plugin that encodes the bank's methodology for building agentic banking use cases.

## What this plugin does

Installs into Claude Code and makes the bank's standards executable:

- **Slash commands** for the work — `/new-use-case`, `/new-atomic-service`, `/author-rule`, `/new-agent`, `/review-uc`, `/compliance-pack`, `/promote`
- **Skills** that auto-invoke when Claude needs to know how to build something — handler design, ADK agent design, the six console patterns, observability patterns
- **Subagents** for specialized roles — architecture-auditor, compliance-reviewer, security-reviewer, test-author, terraform-author, prompt-author
- **Hooks** for floor-level enforcement — pre-commit architecture audit, post-write test runner, session-start context

## Installation

### Option A — direct git install (start here)

```bash
git clone git@internal-git.bank.example.com:platform/agentic-banking-platform.git \
  ~/.claude/plugins/agentic-banking-platform
```

Restart Claude Code. The plugin's slash commands appear in `/` autocomplete.

### Option B — bank's internal marketplace

```bash
claude marketplace add bank-internal git@internal-git.bank.example.com:platform/marketplace.git
claude plugins install agentic-banking-platform
```

## Project setup

For each use case repo, create a `.claude/settings.json`:

```json
{
  "extends": "agentic-banking-platform"
}
```

And copy the platform `CLAUDE.md` to your repo root (or use `/init-use-case` which does this for you).

## First use

```bash
$ mkdir my-new-use-case && cd my-new-use-case
$ git init
$ claude
> /init-use-case "complaint triage"
> /new-use-case
```

## Repo layout

```
.claude-plugin/plugin.json           # plugin manifest
skills/                              # slash commands and auto-invoked knowledge
  new-use-case/                      # /new-use-case
  new-atomic-service/                # /new-atomic-service
  author-rule/                       # /author-rule
  new-agent/                         # /new-agent
  review-uc/                         # /review-uc
  compliance-pack/                   # /compliance-pack
  promote/                           # /promote
  init-use-case/                     # /init-use-case
  handler-design/                    # auto-invoked
  adk-agent-design/                  # auto-invoked
  workflow-design/                   # auto-invoked
  model-selection/                   # auto-invoked
  observability-patterns/            # auto-invoked
  console-pipeline/                  # auto-invoked when archetype is pipeline
  console-investigations/            # auto-invoked when archetype is investigations
  console-realtime/                  # auto-invoked when archetype is real-time
  console-surveillance/              # auto-invoked when archetype is surveillance
  console-run/                       # auto-invoked when archetype is run
  console-recommendations/           # auto-invoked when archetype is recommendations
agents/                              # subagent definitions
  architecture-auditor.md
  compliance-reviewer.md
  security-reviewer.md
  test-author.md
  terraform-author.md
  prompt-author.md
  cross-impact-analyzer.md
hooks/                               # event-driven enforcement
  pre-commit-arch-audit.sh
  session-start-context.sh
scripts/                             # helper scripts skills invoke
policies/                            # OPA / Conftest policies
reference/                           # canonical architecture docs
  architecture.md
  console_reference.md
  methodology.md
CLAUDE.md                            # always-loaded conventions for projects
```

## What's included in this initial release

This is v0.1.0 — the bootstrap MVP. Includes:

- All 7 primary slash commands
- 12 supporting skills
- 4 subagents (architecture-auditor, compliance-reviewer, test-author, terraform-author)
- 2 hooks (pre-commit-arch-audit, session-start-context)
- Canonical reference documents

Coming in subsequent releases:

- Full template directories for each scaffold (Cloud Run, ADK, JDM, etc.)
- The remaining 4 subagents (security-reviewer, prompt-author, cross-impact-analyzer, runbook-author)
- Synthetic load harness, eval set runner
- OPA policy bundle for GCP

## Maintenance

The platform team owns this plugin. Use case teams contribute via PR. Each PR runs the plugin's own architecture audit before merge. Versions follow semver; breaking changes get major version bumps with migration guides.

## Documentation

Read in this order:

1. `reference/architecture.md` — the 5-step paradigm and platform architecture
2. `reference/console_reference.md` — the six console patterns
3. `reference/methodology.md` — how the plugin executes the methodology
4. Then explore individual skills and subagents
