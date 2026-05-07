# Audit trail spec template

```markdown
# Audit trail specification: {use_case_id}

## What gets logged

### Per workflow execution
- workflow_run_id (Cloud Workflows execution ID)
- context_id (transaction / case / application ID)
- start_time, end_time
- final_action
- All step outcomes

### Per rule evaluation
- evaluation_id, context_id, rule_name + version
- input payload (schema-validated, redacted as needed)
- output: action, reasons, full trace
- evaluator: rules-service version
- timestamp

### Per agent invocation
- invocation_id, context_id, agent_id + version, model used
- input, output, tool calls (each with input + output)
- token counts (input, output), duration_ms, confidence, timestamp

### Per human action
- action_id, context_id, user_id (Agent Identity SVID)
- action_type (approve, edit, reject, defer)
- diff (what they changed), justification (free text), timestamp

## Storage
- Cloud SQL `audit_events` table (operational; portable across cloud)
- BigQuery `audit.*` tables (analytics/reporting; nightly export)
- Retention: 7 years (banking regulatory requirement)
- Encryption: CMEK
- Access: read-only for auditors via approved IAM role

## Replay
Run `/replay-incident {context_id}` to reconstruct the full causal trace.

## Compliance attestations
- SR 11-7 model risk monitoring requirements
- {regulation-specific requirements}
- Bank's internal audit retention policy
```
