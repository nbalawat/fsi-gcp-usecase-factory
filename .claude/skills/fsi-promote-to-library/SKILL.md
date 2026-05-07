---
name: fsi-promote-to-library
description: Walk the team through promoting a built shape (archetype / pattern / fragment / use-case archetype) from a UC into the shared library. Versioning + tests + arch review gate.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, cp:*)
---

You are promoting a shape from a use case into the shared library so future use cases can reuse it. Promotion is the gate that turns a one-off into a reusable archetype.

## When to invoke

The "rule of three" — when the same shape has been built **twice** and the third instance is starting, promote the existing pattern. The `cross-impact-analyzer` agent flags candidates automatically; this skill walks the promotion.

Common promotions:
- Three UCs are about to use the same agent specialist → promote to `libraries/agents/<archetype>/`
- Three UCs use the same workflow shape → promote to `libraries/patterns/<pattern>/`
- Three UCs use the same fragment → promote to `libraries/workflows/<fragment>/`
- An entire UC shape repeats → promote to `libraries/use-cases/<archetype>/`

## Step 1 — Identify the shape

Ask:

1. **What kind of shape?** (agent | pattern | fragment | use-case-archetype)
2. **Source instances** — which 2-3 UCs already implement this?
3. **Proposed name** — kebab-case, descriptive (`risk-rater`, not `commercial-credit-rater`)

## Step 2 — Diff the source instances

Walk each source instance and identify:

- **What's the same** across all instances → goes into the archetype/pattern body
- **What varies** across instances → becomes parameters (template variables)
- **What's domain-specific** → stays in each UC's instantiation

For an agent archetype (Layer 3) example:
- Same: rubric structure, output schema, prompt-injection defense, factor-citation requirement
- Varies: rubric content (industry-specific bands), regulatory regime, memory scope
- Domain-specific: each UC's `usecases/<uc>/agents/prompts/<role>.md` retains UC examples

## Step 3 — Author the library entry

Layer 3 (agent archetype) shape:

```
libraries/agents/<name>/
├── archetype.yaml           # name, version, description, default_model, parameters, tool_signature, output_schema
├── instruction.md.j2        # Jinja2 prompt template with {{params}}
├── tests/
│   └── golden/              # 5+ golden input/output cases
└── examples/
    └── <use_case_id>.md     # how each existing UC instantiates this
```

Layer 4 (multi-agent pattern) shape:

```
libraries/patterns/<name>/
├── pattern.yaml             # name, version, description, agent_roles, edges, params
├── README.md                # diagram + when to use + how to instantiate
└── examples/
    └── <use_case_id>.md
```

Layer 5 (workflow fragment) shape:

```
libraries/workflows/<name>/
├── fragment.yaml.j2         # Jinja2 Cloud Workflows YAML snippet
├── parameters.yaml          # declared inputs
├── tests/
│   └── render_test.yaml     # parameterised render test
└── README.md
```

Layer 6 (use-case archetype) shape:

```
libraries/use-cases/<name>/
├── archetype.yaml           # name, version, console_pattern, agent_archetypes, fragments
├── reasons_skeleton.yaml    # REASONS canvas with placeholders
├── tests/
│   └── golden/              # one full UC instantiation
└── README.md
```

## Step 4 — Set the initial version

First promotion is `v1.0.0`. Subsequent versions follow semver:

- **Patch (1.0.x):** doc tweaks, additional examples, bug-fix templates
- **Minor (1.x):** new optional parameter, new tool_signature variant, additive
- **Major (x):** breaking — input/output shape changed, parameter renamed, semantics shifted. Old version stays alive; existing UCs migrate explicitly.

## Step 5 — Generate golden tests

Each archetype/pattern/fragment must have golden tests:

- **Layer 3 archetype:** golden input/output for the agent's response shape with sample params.
- **Layer 4 pattern:** golden composition — given sample agent specialists, the pattern produces the expected supervisor wiring.
- **Layer 5 fragment:** render the fragment with sample params; assert the output is valid Cloud Workflows YAML.
- **Layer 6 use-case archetype:** golden REASONS canvas → expected Operations DAG.

## Step 6 — Migrate the source UCs

For each source UC that already implements this shape:

1. Update its REASONS Structure section to reference `libraries/<layer>/<name>@1.0` instead of inline definition.
2. Re-run the appropriate builder (`archetype-builder` for L3, `workflow-builder` for L5, etc.) so the UC's local artifact is regenerated against the library reference.
3. Run validators on the regenerated artifact.

## Step 7 — Architecture review gate

Before merging, the `architecture-auditor` subagent must confirm:

- Library entry has all required files
- Golden tests pass
- Migrated source UCs all still PASS validators after switching to the library reference
- The library entry's `description` is one sentence, ≤ 50 words

If any check fails, promotion is blocked. Iterate.

## Step 8 — Update the catalog

Append to `docs/methodology/library_catalog.md` (create if missing):

```markdown
## <name> @ 1.0.0
**Layer:** <3 | 4 | 5 | 6>
**Description:** <one line>
**First-use UCs:** <list of 2-3 source UCs>
**Promoted:** <date>
**Owner:** <team>
```

## Step 9 — Report

```
DONE /fsi-promote-to-library — <name>@1.0.0 → libraries/<layer>/<name>/
  Source UCs migrated: <list>
  Golden tests:        <N> pass
  Validators:          PASS for all source UCs
  Catalog updated:     docs/methodology/library_catalog.md
```

## Anti-patterns to refuse

- Promoting from a single instance. The "rule of three" exists because shapes built once are usually too narrow.
- Skipping the migration step (Step 6). A library entry without consumers is dead weight.
- Promoting without golden tests. Untested archetypes drift silently.
- Major version bumps without keeping the old version available — breaks every UC that pinned it.
