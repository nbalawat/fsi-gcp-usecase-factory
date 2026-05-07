---
name: author-rule
description: Author a new GoRules Zen JDM rule → JDM artifact + golden test set + threshold metadata. The deterministic decision layer (step 3) of the 5-step paradigm.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, jsonschema:*, python:*)
---

<!-- EXCEPTION: oversize body tracked in KNOWN_ISSUES.md; v0.1.2 split planned per Sprint-0 audit -->


You are authoring a new JDM rule for the bank's rules service.

## Why this matters

Rules in this platform are NOT Python `if`/`else`. They are JDM artifacts evaluated by GoRules Zen. This is non-negotiable. Reasons:

- Compliance can read JDM without reading Python
- Threshold values are versioned by `effective_date` separately from logic
- Auditors get a structured decision trace per evaluation
- Rules can be hot-reloaded without redeploying services

If the user wants to put rules logic in Python, refuse and explain.

## Step 1 — Gather context

Ask, one at a time:

1. **What is the rule deciding?** Should be one decision: pass/fail, action category, eligibility classification.
2. **What use case will use it?** Multiple use cases can share rules; this is fine.
3. **What inputs does the rule evaluate?** (e.g., transaction amount, count_1h, merchant_risk, applicant_dti)
4. **What output does it return?** (action, reason codes, optional sub-classifications)
5. **What thresholds are involved?** List each threshold with proposed value and source (regulation citation, internal policy, etc.).
6. **Should thresholds be parameterized?** If they vary by account type / customer segment / region, they should be in BigQuery threshold tables, not hardcoded in JDM.

## Step 2 — Verify reuse

Run `ls rules/`. Read existing JDM files. If a similar rule exists, ask if the user wants to:
(a) Reuse — point them to it
(b) Extend — add a new decision node
(c) Create a separate rule — explain why

Avoid rule sprawl.

## Step 3 — Decide on rule structure

The JDM patterns supported:

- **Decision table** — most common. Conditions × outcomes table.
- **Function expression** — for computational decisions (e.g., DSCR = NOI / debt_service)
- **Decision graph** — chained decision tables for multi-stage logic

Pick based on the rule's nature:
- "If X and Y, then Z" → decision table
- "Compute X = f(inputs)" → function expression  
- "First check A, then if A passes check B, else check C" → decision graph

## Step 4 — Author the JDM

Generate `rules/{rule_name}/v{version}.json`. Example structure:

```json
{
  "name": "{rule_name}",
  "version": "1.0",
  "effective_from": "2026-01-01",
  "effective_to": null,
  "description": "{one-sentence description}",
  "owner": "compliance-team",
  "regulatory_citation": "{e.g. BSA 31 CFR 1010.310}",
  "nodes": [
    {
      "id": "input",
      "type": "inputNode",
      "name": "Input"
    },
    {
      "id": "main_check",
      "type": "decisionTableNode",
      "name": "{descriptive name}",
      "content": {
        "rules": [
          {
            "input_field_1": "> 10000",
            "input_field_2": "in [\"high\", \"blocked\"]",
            "action": "decline",
            "reasons": ["VELOCITY_HIGH", "MERCHANT_RISK"]
          },
          {
            "input_field_1": "> 5000",
            "action": "gray_zone",
            "reasons": ["VELOCITY_ELEVATED"]
          },
          {
            "default": true,
            "action": "clear",
            "reasons": []
          }
        ]
      }
    },
    {
      "id": "output",
      "type": "outputNode",
      "name": "Output"
    }
  ],
  "edges": [
    {"source": "input", "target": "main_check"},
    {"source": "main_check", "target": "output"}
  ]
}
```

Key fields:
- `effective_from` / `effective_to` — when this version is active
- `regulatory_citation` — auditors will look for this
- `owner` — who can approve changes

## Step 5 — Threshold table strategy

If thresholds should vary by segment, generate a BigQuery threshold table migration:

```sql
CREATE TABLE IF NOT EXISTS rules_thresholds.{rule_name}_thresholds (
  segment STRING NOT NULL,        -- e.g., "personal", "business", "wealth"
  threshold_name STRING NOT NULL, -- e.g., "max_single_amount"
  threshold_value FLOAT64 NOT NULL,
  effective_from TIMESTAMP NOT NULL,
  effective_to TIMESTAMP,
  version STRING NOT NULL,
  approved_by STRING NOT NULL,
  PRIMARY KEY (segment, threshold_name, effective_from) NOT ENFORCED
)
PARTITION BY DATE(effective_from);
```

The JDM rule then reads thresholds at evaluation time via the rules service's BigQuery loader. (The mechanism is built into the bank's rules service; the rule just references threshold names.)

## Step 6 — Generate golden test set

Create `tests/golden/{rule_name}/test_cases.json`:

```json
{
  "rule": "{rule_name}",
  "version": "1.0",
  "cases": [
    {
      "name": "happy_path_clear",
      "input": { "input_field_1": 100, "input_field_2": "low" },
      "expected_action": "clear",
      "expected_reasons": []
    },
    {
      "name": "boundary_threshold",
      "input": { "input_field_1": 5000, "input_field_2": "low" },
      "expected_action": "gray_zone",
      "expected_reasons": ["VELOCITY_ELEVATED"]
    },
    {
      "name": "decline_path",
      "input": { "input_field_1": 12000, "input_field_2": "high" },
      "expected_action": "decline",
      "expected_reasons": ["VELOCITY_HIGH", "MERCHANT_RISK"]
    }
  ]
}
```

Required minimum:
- 1 case per row in the decision table
- 1 case per boundary value (just above and just below thresholds)
- 1 default-rule case
- 3-5 real-world examples drawn from the user's domain knowledge

Ask the user for real-world examples; they're the most valuable test cases.

## Step 7 — Validate the JDM

```bash
# Validate JSON structure
python -m jsonschema -i rules/{rule_name}/v1.json \
  ${CLAUDE_PLUGIN_DIR}/policies/jdm_schema.json

# Run golden tests against the JDM
python ${CLAUDE_PLUGIN_DIR}/scripts/run_golden_tests.py \
  --rule rules/{rule_name}/v1.json \
  --tests tests/golden/{rule_name}/test_cases.json

# Output should be: "All N cases passed."
```

If golden tests fail, debug with the user. Either the rule has a bug or the test expectations are wrong. Both are valid outcomes; surface the discrepancy clearly.

## Step 8 — Generate documentation

Write `docs/rules/{rule_name}.md`:

```markdown
# Rule: {rule_name}

## Purpose
{description}

## Regulatory citation
{citation}

## Owner
{owner team}

## Effective
{effective_from} → {effective_to or "current"}

## Decision logic
{narrative explanation of what the rule does, in plain English for compliance reviewers}

## Inputs
| Field | Type | Description |
|-------|------|-------------|
| ... | ... | ... |

## Outputs
| Field | Type | Description |
|-------|------|-------------|
| action | enum | clear / decline / gray_zone |
| reasons | list[string] | reason codes |

## Thresholds (if applicable)
{table of thresholds, source, last update, approver}

## Test coverage
- Total cases: {N}
- Happy paths: {M}
- Boundary cases: {K}
- Real-world examples: {L}

## Change history
| Version | Date | Change | Approver |
|---------|------|--------|----------|
| 1.0 | {today} | Initial | {user} |
```

## Step 9 — Compliance review checklist

Before user submits this rule for production:

- [ ] Rule has a regulatory citation (or business policy citation)
- [ ] Owner team is identified
- [ ] Effective dates are set
- [ ] Threshold values are sourced (regulation, policy, board approval)
- [ ] Golden test set covers all decision paths
- [ ] Golden test set includes 3+ real-world examples
- [ ] Documentation is complete
- [ ] The rule has been reviewed by the owner team

Surface this checklist to the user. Don't try to satisfy it for them — they need human judgment.

## Step 10 — Report

```
✓ Rule authored: rules/{rule_name}/v1.json
  Version: 1.0, effective from {date}
  Decision logic: {summary}
  Threshold table: {created/not needed}
  Golden tests: {N} cases, all passing
  Documentation: docs/rules/{rule_name}.md

Next:
  1. Have the owner team ({owner}) review the rule
  2. Add additional real-world test cases as you encounter edge cases
  3. The rule is loaded into the rules service via GCS deploy on next pipeline run
  4. Deploy with `gcloud storage cp rules/{rule_name}/v1.json gs://bank-rules-{env}/{rule_name}/`
```

## Anti-patterns to refuse

- Putting rule logic in Python `if`/`else` outside the rules service
- Hardcoding thresholds in JDM that should be in BigQuery (when they vary by segment)
- Rules without regulatory citations or business policy references
- Rules without golden test coverage
- Rules with decisions like "ask the agent" — rules return deterministic actions; agents reason about gray zones
