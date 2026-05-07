# complaint-categorizer

Classifies complaints into CFPB taxonomy + bank-internal routing tags + severity.

## When to use

- Complaint triage (CFPB-portal complaints, BBB, state AG referrals)
- Dispute routing (Reg E, Reg Z, Reg DD, FDCPA)
- Customer service ticket routing

## Why Flash

High volume, shape-bound output (CFPB taxonomy is enumerated). Opus only on fallback when confidence is low.

## Instantiation example

```yaml
agents:
  - role: categorizer
    archetype_ref: complaint-categorizer@1.0
    params:
      cfpb_taxonomy_version: cfpb-issues-2024-q4
      routing_tags:
        - dispute_team
        - fraud_team
        - compliance_team
        - fair_lending
        - executive_complaints
      input_schema: usecases/complaint-triage/schemas/complaint.py
      severity_tagging: true
```
