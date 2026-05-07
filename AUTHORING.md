# Authoring Conventions for Skills, Subagents, and Hooks

These conventions govern every `SKILL.md`, agent `.md`, and hook script in this toolkit. They exist to keep the factory invocable as it scales past 30+ skills — the difference between *"Claude maybe finds the right skill"* and *"Claude reliably loads it."*

Adopted from [mattpocock/skills](https://github.com/mattpocock/skills) authoring patterns and validated against the existing 19 skills via the Sprint-0 audit.

---

## Reference templates (start here)

When authoring a new skill, look at one of these first:

| Skill | Why it's a reference |
|---|---|
| [.claude/skills/handler-design/SKILL.md](.claude/skills/handler-design/SKILL.md) | Gold standard for **auto-invoked design-knowledge** skills: tight description, concrete decision trees, anti-pattern tables, code blocks, < 150 lines |
| [.claude/skills/new-atomic-service/SKILL.md](.claude/skills/new-atomic-service/SKILL.md) | Reference for **slash-command skills** with a sibling `template/` directory |
| [.claude/skills/workflow-design/SKILL.md](.claude/skills/workflow-design/SKILL.md) | Reference for reference-style design knowledge with strong cross-links |

---

## Hard rules (linted)

These are checked by `scripts/lint_toolkit.sh` and must pass before commit.

### Frontmatter

Every `SKILL.md` has YAML frontmatter:

```yaml
---
name: <kebab-case-name>                      # required, matches directory name
description: <one sentence>                  # required, see Description rules below
disable-model-invocation: true               # optional; set for slash commands the user must invoke explicitly
allowed-tools: <comma-separated tool list>   # optional; restricts which tools Claude can use
---
```

Every agent file in `.claude/agents/` has frontmatter:

```yaml
---
name: <kebab-case-name>
description: <one sentence with workflow-notation triggers>
tools: <comma-separated>
---
```

### Description rules

- **One sentence.** ≤ 30 words. Two sentences allowed only if the first names the trigger and the second narrows the scope.
- **Workflow notation** when the skill encodes a sequence: use arrows `→` or pipe-separated stages. Example: *"Decompose use case → 5-step paradigm → identify reuse → scaffold."*
- **Trigger condition explicit** for auto-invoked skills. Pattern: *"Auto-invoked when files in `<path>` are being read, written, or edited."* Vague triggers are warned.

### Length

- `SKILL.md` body: **≤ 150 lines preferred, ≤ 200 hard limit**.
- Over 200 lines → split into sibling skills or move detail to `references/` / `template/` next to the skill.
- Slash-command "mega-skills" that scaffold large systems: cap the user-facing skill at 150 lines and delegate detail to subagents (`.claude/agents/`) or templates (`<skill>/template/`).

### File layout

```
.claude/skills/<skill-name>/
├── SKILL.md                         # ≤ 150 lines
├── template/                        # optional; Jinja2 templates for code generation
│   └── <files>
└── references/                      # optional; deeper context referenced from SKILL.md
    └── <topic>.md
```

Kebab-case for everything: directories, files, names.

### Body structure

Two valid shapes:

**Shape A — Prescriptive state machine** (slash-command skills):
- `## Step 1 — <verb phrase>`, `## Step 2 — ...`, `## Step N`
- Each step has clear inputs, outputs, transition condition
- Examples sparse, anchoring concepts not enumerating variations

**Shape B — Reference catalog** (auto-invoked design-knowledge skills):
- Named sections (`## When this fits`, `## Patterns`, `## Anti-patterns`)
- Tables for rule sets, code blocks for patterns
- Cross-links to other skills and reference docs instead of duplicating shared content

Wall-of-prose without sequence or named sections fails the audit.

### Punctuation and density

- Tables for rule sets, options, comparisons.
- Arrows (`→`), pipes (`|`), bullets for sequences and decision branches.
- Code blocks for patterns and examples.
- Avoid paragraphs longer than 4 lines.

### Cross-references over duplication

If shared content exists (component lists, model conventions, paradigm rules), link to it. The Sprint-0 audit found six console skills duplicating the same component library — fixed in v0.1.1 by introducing `docs/methodology/_shared-components.md` and linking. New skills must follow this pattern.

### No re-explanation of project structure

`/init-use-case` exists. Skills should not re-document what it scaffolds. Assume `services/`, `rules/`, `agents/`, `workflows/`, `usecases/<name>/` are present.

---

## Soft rules (warned, not blocked)

- Avoid embedding **API code that drifts** with external SDK versions. Move API-specific code to a dedicated live-doc skill (e.g. `fsi-adk-patterns` for ADK code) with a `last_verified` stamp.
- Avoid embedding **full template text** in step content. Reference template paths instead: *"Use `template/model-card.md.j2` as the base; substitute `{use_case_id}`, `{owner}`, `{models}`."*
- Avoid mixing **design knowledge with workflow logic** in auto-invoked skills. Design knowledge → reference catalog. Workflow logic → slash command.
- Provide **concrete examples** in design-knowledge skills (data shapes, code patterns). Empty `## Examples` section warns.

---

## Agents (subagents in `.claude/agents/`)

Two kinds:

| Kind | Purpose | Examples |
|---|---|---|
| **Gatekeeper** | Reviews artifacts, returns PASS / FAIL with rationale. Sequential. | `architecture-auditor`, `compliance-reviewer`, `security-reviewer`, `cross-impact-analyzer` |
| **Builder** | Produces one artifact from a typed spec. Parallel-safe. | `atomic-service-builder`, `jdm-rule-builder`, `agent-specialist-builder` (planned) |

Builder agents must:
- Take a typed spec (YAML or JSON) as input — never read shared mutable state mid-flight
- Write to a deterministic path
- Be idempotent: same input → same output
- Report the path back

Gatekeepers run *after* the parallel build completes, never alongside it.

---

## Hooks (`.claude/hooks/`)

- Bash scripts begin with `#!/usr/bin/env bash` and `set -euo pipefail`.
- Use `${CLAUDE_PROJECT_DIR}` (not `${CLAUDE_PLUGIN_DIR}` — this is project-local) for paths.
- Hook config lives in `.claude/settings.json`, not separate `<hook>.json` files.
- Hook scripts must be quick: `SessionStart` ≤ 5s, `PreToolUse` ≤ 60s.
- Pass `shellcheck` cleanly.

---

## REASONS canvas (for use cases, not skills)

Every use case under `usecases/<name>/` has a `reasons.yaml` matching `policies/reasons_schema.json`. See [.claude/skills/fsi-reasons-canvas/SKILL.md](.claude/skills/fsi-reasons-canvas/SKILL.md) (Sprint 1).

This is not a skill-authoring rule — it's the contract every use case must produce. Listed here for awareness.

---

## Lint checklist (mechanical — `scripts/lint_toolkit.sh`)

- [ ] `SKILL.md` has frontmatter with `name` + `description`
- [ ] `name` matches directory name
- [ ] `description` ≤ 30 words
- [ ] Body ≤ 200 lines
- [ ] Either Shape A (`## Step N`) or Shape B (named reference sections)
- [ ] Hooks pass `shellcheck`
- [ ] All YAML/JSON validates against schemas in `policies/`
- [ ] Agent files have frontmatter with `name` + `description` + `tools`

CI fails any violation. PR cannot merge until lint passes.

---

## When to break a rule

Add a comment block at the top of the offending file with the justification and a link to the architecture review or PR that approved the exception. The architecture-auditor subagent looks for `EXCEPTION:` markers and respects them; without one, it fails the file.

---

## Audit cadence

The full audit (this checklist applied to every `SKILL.md` and agent file) runs:
- **Pre-merge** in CI on any PR touching `.claude/`
- **Quarterly** as a manual sweep, even without changes — catches drift in skills that haven't been touched
