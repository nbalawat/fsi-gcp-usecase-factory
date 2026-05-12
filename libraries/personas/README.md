# Banking personas

15 banking personas referenced by use case briefs (`usecases/<uc>/brief.yaml`
under `stakeholders.personas[]`). Each persona is intentionally **a starting
point**, not an exhaustive profile — UC briefs apply a per-UC `overlay`
to capture nuance specific to their context.

## Format

Each `<persona-id>.yaml` contains:

- `id` — the kebab-case key briefs reference
- `display_name` — human-readable label for UIs
- `role_family` — one of: relationship, credit, ops, risk, compliance, audit, customer, leadership
- `seniority` — individual-contributor / manager / executive
- `daily_tools` — what they sit in front of today
- `primary_goals` — what success looks like to them
- `frustrations` — what wastes their time today
- `regulatory_exposure` — regs that touch their work
- `decision_authority` — what they can sign off on without escalation
- `keyboard_proficiency` — high / medium / low (drives UI density choices)

## When to add a persona

Add a persona to this library when:

- the role recurs across ≥2 use cases, AND
- the daily-tools / goals / frustrations profile is materially distinct from existing personas

If a UC has a persona that doesn't fit any library entry, capture it
inline via the brief's persona `overlay.notes` field. After 2+ UCs
reference the same overlay, promote to a library file.

## Cross-reference

Used by:
- `/fsi-onboard` Round 2 — sponsor picks personas from this library
- `/fsi-design-proposals` — designer agents read persona details when picking layout / language
- `scripts/scan_factory_for_reuse.mjs` — surfaces persona-driven UI patterns
