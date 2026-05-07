# Pattern: triage-investigator-narrator

Three-stage case investigation: classify → investigate → narrate. Used wherever the output is regulator-readable text grounded in tool-driven evidence.

## Diagram

```
case-arrives → [triage]
                  │
                  ↓
              [investigator] ←──── tools (atomic services + external lookups)
                  │
        evidence sufficient? ┼─ no ──→ human-pause-resume
                  │
                  ↓
              [narrator]
                  │
                  ↓
              regulator-format text
```

## When to use

- **SAR investigation** (BSA): triage = sus-act categorization, investigator = pulls counterparty/transaction graph, narrator = SAR narrative for FinCEN.
- **Reg E dispute investigation**: triage = dispute type, investigator = transaction history + merchant data, narrator = response letter to customer.
- **Breach notification**: triage = severity assessment, investigator = scope determination, narrator = state-specific notification draft.

## Why this pattern

The three stages have different cognitive shapes:
- Triage is shape-bound classification (Flash, sub-second).
- Investigation is open-ended tool use with budget (Opus, multi-step, multi-tool).
- Narration is format adherence + citation density (Opus, single-shot).

A single agent doing all three would be either (a) too cheap to draft regulator-quality narratives or (b) too expensive to run on every triage event.

## Instantiation example (SAR)

```yaml
structure:
  multi_agent_pattern: triage-investigator-narrator@1.0
  agent_archetypes:
    - role: triage
      archetype_ref: complaint-categorizer@1.0   # AML-specific vocabulary
    - role: investigator
      archetype_ref: document-extractor@1.0       # plus tool wiring for graph lookups
    - role: narrator
      archetype_ref: regulatory-narrator@1.0
      params: {target_regulator: FinCEN-SAR, format_template: templates/sar-narrative-fincen-2024.md}
  pattern_params:
    regulator_format: FinCEN-SAR
    investigation_max_seconds: 600
```
