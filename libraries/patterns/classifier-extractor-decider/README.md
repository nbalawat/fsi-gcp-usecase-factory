# Pattern: classifier-extractor-decider

Three-agent pipeline for high-volume document workflows where only a fraction warrant deep processing.

## Diagram

```
incoming-doc → [classifier]
                  │
        confident? ┼─ no ──→ human-queue
                  │
        in extract_labels? ┼─ no ──→ early-return
                  │
                  ↓
              [extractor]
                  │
                  ↓
              [decider]
                  │
                  ↓
              decision
```

## When to use

- **Mortgage origination**: classify uploaded files (1003, paystubs, W-2, tax return, appraisal); deep-extract only financial-statement-shaped docs; decide eligibility.
- **Complaint triage**: classify into CFPB taxonomy; extract narratives only for routes that need them; decide handling tier.
- **KYC onboarding**: classify identity docs; extract from acceptable types only; decide pass/refer.

## Why this pattern

The classifier is cheap (Gemini Flash, sub-second), so running it on every doc is fine. The extractor is expensive (Opus, multi-second). Without the classifier filter, the extractor budget blows up.

## Instantiation example (mortgage)

```yaml
# usecases/mortgage-origination/reasons.yaml
structure:
  multi_agent_pattern: classifier-extractor-decider@1.0
  agent_archetypes:
    - role: classifier
      archetype_ref: document-classifier@1.0
      params: {vocabulary: [1003, paystub, w2, tax_return, appraisal, other], confidence_floor: 0.8}
    - role: extractor
      archetype_ref: document-extractor@1.0
      params: {extract_schemas: {1003: ...,  paystub: ..., ...}}
    - role: decider
      archetype_ref: eligibility-checker@1.0
      params: {policy_doc_refs: [policies/mortgage-eligibility-2024.md], ...}
  pattern_params:
    extract_labels: [1003, paystub, w2, tax_return]
    human_queue_topic: mortgage-origination.manual-review
```
