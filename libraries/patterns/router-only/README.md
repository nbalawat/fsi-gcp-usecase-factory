# Pattern: router-only

Simplest multi-agent pattern: one classifier dispatches to one of N downstream topics. No investigation, no narration.

## Diagram

```
incoming → [router] ──→ topic-A   (label = X)
                   ──→ topic-B   (label = Y)
                   ──→ topic-default  (low confidence or unknown label)
```

## When to use

- **Complaint triage**: route to dispute / fraud / fair-lending teams without further processing in the agent layer.
- **Inbound document routing**: trade-finance docs → trade-finance team, payment notices → operations, etc.
- **Tier dispatch**: small-loan vs commercial-loan vs syndicated-loan paths.

## Why this pattern (vs no pattern)

You could just use rules. Use the agent pattern when:
- The classification is fuzzy (rules can't capture every variant)
- Volume justifies a Flash call (cheap)
- A confidence threshold + default-topic fallback gives operational safety

For deterministic routes, just use the rules-service.

## Instantiation example

```yaml
structure:
  multi_agent_pattern: router-only@1.0
  agent_archetypes:
    - role: router
      archetype_ref: complaint-categorizer@1.0
      params: {cfpb_taxonomy_version: cfpb-issues-2024-q4, severity_tagging: true}
  pattern_params:
    route_table:
      fraud_team: complaints.fraud.v1
      compliance_team: complaints.compliance.v1
      executive_complaints: complaints.executive.v1
    default_topic: complaints.general-servicing.v1
```
