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
