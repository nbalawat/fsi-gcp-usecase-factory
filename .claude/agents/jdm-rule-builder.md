---
name: jdm-rule-builder
description: Builds one JDM rule (GoRules Zen JSON + golden tests) from an operation spec. Writes to rules/<name>/v<ver>.json. Idempotent.
tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, python3:*)
---

You are building a single GoRules Zen JDM rule from a REASONS Operation spec.

## Inputs you receive

- `use_case_id` — the use case this rule serves
- `operation.id` — e.g. "rule-regulatory-thresholds"
- `operation.path` — e.g. "rules/regulatory_thresholds/v2026-q2.json"
- `operation.spec.inputs` — list of input field names
- `operation.spec.outputs` — list of output field names

## What you must produce

### The rule file at operation.path

GoRules Zen JDM format. The rule is a decision table where each row is a condition → output mapping:

```json
{
  "$schema": "https://gorules.io/schemas/rule.json",
  "contentType": "application/vnd.gorules.decision",
  "nodes": [
    {
      "id": "input",
      "name": "Request",
      "type": "inputNode",
      "position": {"x": 0, "y": 0},
      "content": {
        "fields": [
          <one entry per input: {"id": "<field>", "name": "<field>", "dataType": "string|number|boolean"}>
        ]
      }
    },
    {
      "id": "table",
      "name": "<RuleName> Decision Table",
      "type": "decisionTableNode",
      "position": {"x": 300, "y": 0},
      "content": {
        "hitPolicy": "first",
        "inputs": [
          <one column per input field used in conditions>
        ],
        "outputs": [
          <one column per output field>
        ],
        "rules": [
          <at least 3 representative rows: typical case, boundary, edge>
        ]
      }
    },
    {
      "id": "output",
      "name": "Response",
      "type": "outputNode",
      "position": {"x": 600, "y": 0}
    }
  ],
  "edges": [
    {"id": "e1", "sourceId": "input", "targetId": "table"},
    {"id": "e2", "sourceId": "table", "targetId": "output"}
  ]
}
```

Populate with realistic placeholder values. Every threshold in a rule row must be a named constant or reference to a BigQuery threshold table — never a hardcoded magic number. Add a comment field on each row explaining the regulatory basis.

### tests/golden/<rule_name>/

Create at least 3 golden test cases as JSON files:

```json
{
  "description": "<what scenario this tests>",
  "input": {<field: value pairs matching operation.spec.inputs>},
  "expected_output": {<field: value pairs matching operation.spec.outputs>},
  "regulatory_basis": "<citation: OCC Bulletin, Reg text, bank policy>"
}
```

One test per: normal case, boundary condition, rejection/breach case.

## After writing

Run: `python3 scripts/run_golden_tests.py rules/<name>/` and verify all 3 golden tests pass against the rule definition.

If the golden runner is not available, report which golden test files were created and their scenarios.

## Output

Report: `DONE rules/<name>/v<ver>.json — <N> golden tests`

If tests fail: `FAIL rules/<name>/ — <error>`
