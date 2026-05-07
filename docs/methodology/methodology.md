# Methodology — how the plugin executes the standards

This document explains how the plugin's components (skills, subagents, slash commands, hooks) work together to enforce the bank's methodology.

## The mental model

The plugin's job is to make the right path the easy path. A developer who runs `/new-use-case` produces architecture-correct code by default. A developer who tries to violate the standards trips on an error before they can commit.

Five layers of enforcement, in order from soft to hard:

| Layer | Mechanism | Enforcement | Example |
|-------|-----------|-------------|---------|
| 1. Conventions | `CLAUDE.md` | Claude reads every session | "5-step paradigm; six consoles; two models" |
| 2. Knowledge | Auto-invoked skills | Loaded when relevant | `handler-design` loads when editing handler files |
| 3. Workflows | Slash commands | User explicitly invokes | `/new-use-case` walks the methodology |
| 4. Roles | Subagents | Invoked by skills or commands | architecture-auditor reviews PRs |
| 5. Gates | Hooks | Run on Claude Code events | pre-commit hook blocks bad commits |

## How a workflow executes

When a developer types `/new-use-case`:

1. **Claude Code** reads `CLAUDE.md` (always-loaded conventions)
2. **Claude Code** reads the `new-use-case` skill's `SKILL.md`
3. **The skill** instructs Claude to ask diagnostic questions and walk the user through the methodology
4. **Auto-invoked skills** load as Claude works on different files (handler-design when editing handlers, adk-agent-design when working on agents)
5. **The skill** delegates to subagents at specific points:
   - `terraform-author` for IaC generation
   - `test-author` for test generation
   - `prompt-author` for agent prompt drafting
   - `architecture-auditor` for review
6. **Each subagent** runs in isolated context with its own system prompt and tool set
7. **Validation scripts** run as part of the skill (pytest, terraform validate, conftest)
8. **The skill** generates the use case spec and reports completion

## How standards are enforced

### Soft enforcement (Layers 1-3)

Skills tell Claude what to do. Claude follows them. If a developer asks for something that violates standards, the skill instructs Claude to refuse and explain. Examples:

- User asks for a Cloud Run service that calls another atomic service → `atomic-service-design` skill refuses
- User asks to use a model not on the approved list → `model-selection` skill refuses
- User asks to put rules logic in Python → `author-rule` skill redirects to JDM

This works because Claude wants to be helpful. The methodology is presented as the way to be helpful in this codebase.

### Hard enforcement (Layers 4-5)

Subagents and hooks enforce mechanically.

- `architecture-auditor` runs on every PR via the pre-commit hook. Returns FAIL if standards are violated. Hook blocks the commit.
- `compliance-reviewer` runs in `/promote`. Returns BLOCKED if the compliance pack is incomplete. `/promote` refuses to proceed.
- `security-reviewer` runs in `/review-uc` and `/promote`. Returns FAIL on PII or IAM violations. Promotion refuses.

This works because Claude can't bypass the hooks (they're shell scripts run by Claude Code, not optional instructions).

## How skills compose

Skills are designed to be invoked by other skills. Example: `/new-use-case` invokes:

- `init-use-case` (if repo not initialized)
- `handler-design` (auto-invoked while creating handler)
- `atomic-service-design` (for each atomic service)
- `author-rule` (for each new rule)
- `adk-agent-design` (for the agent)
- `workflow-design` (for the Cloud Workflows YAML)
- `console-{pattern}` (for the UI configuration)
- `terraform-module-design` (for IaC)
- `observability-patterns` (auto-invoked while writing service code)

Plus subagents:

- `terraform-author` (delegated by skill)
- `test-author` (delegated by skill)
- `prompt-author` (delegated by skill)
- `architecture-auditor` (final review)

This composition is why one slash command produces a complete use case scaffold. Each skill knows its slice; the orchestrator wires them together.

## How subagents are different from skills

Skills are loaded into the main session's context. They influence Claude's behavior in the conversation. They don't run separately.

Subagents have their own isolated context. They get spawned, do their job, return a result. Their context doesn't pollute the main conversation.

Use subagents when:
- The work is large and would consume too much main-session context
- The role is specialized (architecture audit, security review)
- The work can be done in parallel with other things

Use skills when:
- The knowledge applies inline as Claude works
- The instruction guides Claude's behavior in the current conversation
- The work is small enough to fit alongside other context

## How hooks work

Hooks fire on Claude Code events:

- `SessionStart` — when a session begins
- `PreToolUse` — before Claude uses a specific tool (e.g., before `git commit`)
- `PostToolUse` — after a tool finishes (e.g., after writing a file)
- `UserPromptSubmit` — when the user sends a prompt

Hooks are shell scripts. They can:
- Read context (current files, branch, etc.)
- Run any command (pytest, terraform, claude in non-interactive mode)
- Block the operation (exit non-zero)
- Inject context into the session

The bank's plugin uses hooks for:
- `SessionStart` — display the project context banner
- `PreToolUse` on `git commit` — run architecture audit, block if FAIL

Future hooks (not in v0.1.0):
- `PostToolUse` on file writes — run tests on the touched files
- `UserPromptSubmit` — inject use case context if not present

## How the validation pipeline runs

The plugin's `/promote` command runs a five-layer validation:

1. **Static checks** (pre-flight) — ruff, mypy, pytest, terraform validate
2. **Architecture audit** (architecture-auditor subagent)
3. **Security review** (security-reviewer subagent)
4. **Compliance pack check** (compliance-reviewer subagent)
5. **Cross-impact analysis** (cross-impact-analyzer subagent)
6. **L2 e2e suite** (in ephemeral preview environment)
7. **Impacted use cases' e2e suites** (parallel)
8. **L5 synthetic load** (in performance-tier preview)
9. **Promotion report generation**
10. **Teardown of preview environment**

Any failure aborts the pipeline. The user fixes; re-runs.

## How the methodology evolves

The plugin is itself versioned. The platform team owns it.

When the methodology changes:
- Edit a skill, subagent, or hook in the plugin repo
- Test the change against representative use cases
- Bump the plugin version
- Tag the release
- Use case repos pick up the new version on next session (or via `claude plugins update`)

Use case teams can pin a plugin version for stability. The platform team manages deprecation: announce a year before removing capabilities, ship migration guides, support the old way for one major version.

## Bootstrap sequence for a new bank deployment

Day 1: Install the plugin to one developer's workstation. Walk through `/init-use-case` and `/new-atomic-service` on a toy use case to validate the experience.

Week 1: Get the platform team trained. Each platform engineer should be able to extend a skill or write a new subagent.

Week 2-3: Deploy to a pilot stream (one use case team). Use the plugin for their first use case end-to-end. Identify gaps; iterate the plugin.

Week 4: Roll out to all delivery streams. The plugin becomes the default toolkit for use case work.

Ongoing: Platform team maintains the plugin in response to real use. New use cases reveal gaps; gaps become improvements; improvements ship as plugin updates.

## What the plugin doesn't do

Be explicit about limits:

- Doesn't replace human compliance review (it generates artifacts; humans approve)
- Doesn't replace human architecture review for novel patterns (it audits known patterns; new patterns go to platform team)
- Doesn't substitute for integration test infrastructure (it generates tests; the bank operates the environments)
- Doesn't predict cost overruns (it tracks cost; humans budget)
- Doesn't catch novel security threats (it scans known patterns; red team handles novel)
- Doesn't make hard use cases easy (it speeds scaffolding and validation; the hard parts of work — designing rules, writing prompts, getting data flow right — still require thoughtful engineers)

## What success looks like

After the plugin is mature and adopted:

- A new use case scaffolded in 30 minutes (was: 1-2 weeks)
- A new use case shipped to production in 1-2 weeks (was: 1-2 months)
- Cross-stream consistency without coordination meetings (the plugin is the coordination)
- Compliance review compressed from 8 weeks to 2 weeks per use case (templates do the routine; humans focus on use-case-specific deltas)
- New engineers productive in 2 weeks (the plugin teaches them by doing)
- Standards stay current because they live in code that's used daily, not in documents that go stale

## Where to find things

- Skills: `skills/{name}/SKILL.md`
- Subagents: `agents/{name}.md`
- Hooks: `hooks/{name}.sh` and `hooks/{name}.json`
- Reference docs: `reference/{topic}.md`
- Helper scripts: `scripts/{name}.sh`
- Policies: `policies/{name}.rego`
- Templates (per skill): `skills/{name}/template/`

The plugin is itself a use case in the bank's methodology — it has its own architecture, its own enforcement (PRs are reviewed by the architecture-auditor on the plugin's own code), and its own delivery cadence.
