---
name: author-rule
description: Author a JDM rule from scratch → Zen JSON + golden tests + regulatory citation + docs. Output to rules/<name>/v<ver>.json (shared) or usecases/<uc>/rules/ (use-case-specific).
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, python3:*)
---

You are authoring a JDM rule for the bank's GoRules Zen rules-service.

## Why this matters

Rules are the deterministic policy layer. They run before agents and gate every agent invocation. Each rule has a regulatory or business-policy citation, golden tests, and an effective_date. Rules are versioned; a new version coexists with old versions until cut over.

## Step 1 — Gather context

Ask the user:

1. **Rule purpose** — one sentence
2. **Owner team** — credit, BSA, payments, KYC, etc.
3. **Regulatory citation** — specific (`12 CFR 32.3`, `ASC 326-20-30`, `BSA Final Rule 2022-04`); never vague
4. **Inputs** — what the rule reads from `service_results`
5. **Outputs** — `decision` (APPROVE/DECLINE/REFER) plus any structured fields
6. **Hit policy** — `first` or `collect` (reject anything else)
7. **Shared or UC-specific?** — shared rules go in `rules/`, UC-specific in `usecases/<uc>/rules/`

## Step 2 — Verify reuse

`ls rules/` and `ls usecases/*/rules/`. If a similar rule exists, ask whether to (a) reuse, (b) version-bump, or (c) create new with explanation.

## Step 3 — Decide on rule structure

| Pattern | When |
|---|---|
| Single decision table | One set of conditions → one decision |
| Decision tree | Branching: filter first, then sub-table |
| Function node | Logic too procedural for a table (rare; flag for review) |

## Step 4 — Author the JDM

Read `references/template_jdm.md` for the Zen JSON skeleton. Fill in `inputs`, `outputs`, `rules` rows from Step 1. Set `hitPolicy` to `first` or `collect`.

## Step 5 — Threshold table strategy

If the rule references threshold values, those values come from the Cloud SQL `thresholds` table — not hardcoded in the JDM. The rule's input field is the threshold *name*; the rules-service resolves the value at evaluation time.

Pattern: `if dscr_base < threshold('dscr_pass_min')` — never `if dscr_base < 1.25`.

## Step 6 — Generate golden test set

Read `references/template_golden_tests.md`. Produce at least 5 cases under `<rule_path>/tests/golden/`:
- one per output decision (APPROVE / DECLINE / REFER)
- two boundary cases (just above + just below the cutoff)
- one missing-input case (asserts the rule fails closed)

Run `scripts/run_golden_tests.py <rule_path>` and confirm all pass.

## Step 7 — Validate the JDM

Run:
- `scripts/jdm_lint.sh <rule_path>` — schema validity
- `scripts/run_golden_tests.py <rule_path>` — golden tests pass
- `rule-validator` subagent — full validation including hit policy check

Fix any failures before reporting done.

## Step 8 — Generate documentation

Read `references/template_docs.md` for the rule's documentation structure. Write to `<rule_path>/README.md` covering: purpose, regulatory citation, owner, effective date, decision logic, inputs/outputs schema, change-log.

## Step 9 — Report

```
DONE rules/<name>/v<ver>.json (or usecases/<uc>/rules/<name>.json)
  Hit policy:  {first | collect}
  Inputs:      {N}
  Outputs:     {N}
  Golden:      {N} cases pass
  Validation:  PASS
  Citation:    {regulation}
  Owner:       {team}
```

## Anti-patterns to refuse

- Rules without a `regulatory_citation` — every rule must cite a regulation, board policy, or internal policy doc.
- Hardcoded threshold numbers — values come from Cloud SQL `thresholds`.
- Hit policies other than `first` or `collect`.
- Rules without golden tests.
- "Function nodes" for what should be a decision table — flag for architecture review.
- Mixing shared and UC-specific rules in the same file.
