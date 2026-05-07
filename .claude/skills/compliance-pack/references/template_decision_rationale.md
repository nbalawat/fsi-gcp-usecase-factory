# Decision rationale template

For each decision the agent or rules make, generate one section:

```markdown
## Decision: {decision_name}

**What it decides:** {description}

**Decision authority:** {rules | agent | rules-then-agent | human}

**For deterministic decisions (rules):**
- Rule: {rule_name} v{version}
- Logic: {summary in plain English}
- Threshold sources: {regulation | board approval | policy doc}
- Approver: {team / committee}

**For agent decisions:**
- Agent: {agent_name}
- Model: {model}
- Inputs the agent considers: {list}
- Tools the agent calls: {list with purpose}
- Reasoning pattern: {chain-of-thought / multi-step / supervised}
- Confidence threshold for auto-decision: {value}
- Below threshold: route to {human role}

**Safety mechanisms:**
- {list of constraints, refusals, escalations}

**Audit trail:**
- Every decision records: {fields}
- Retention: {period}
- Replay capability: yes via /replay-incident
```
