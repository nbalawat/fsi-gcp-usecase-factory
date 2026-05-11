# Option C - rationale

## Variation axis: affordance (inline-evidence-driven)

The seed for this option was: every claim in the SAR narrative has an
inline citation to the source evidence. The analyst's eye never leaves
the narrative to verify a fact. Inline `cite source` chips expand to
show the underlying record. Inline `flag this` / `dispute this` /
`add note` actions next to each claim. The final approval surface is
the narrative itself, fully annotated.

Option C honours that brief literally: the page IS the SAR draft, and
every assertion carries an inline citation chip that opens its source
record in a sticky right-rail drawer.

## Why this fits the BSA Analyst persona

The BSA Analyst writing the narrative has one regulatory obligation:
every factual claim in the SAR must be defensible against the source
data. The cost of an unsourced claim is a FinCEN-level finding.

Option C makes this obligation the dominant UI affordance:

- Each claim ends with a tight inline group of `[TXN 04891]`,
  `[GEO MX]`, `[AGT categorizer]`, `[SVC peer]`, `[RUL reg O]` chips.
- One click steers the right-rail `EvidenceDrawer` (sticky position) -
  the analyst never scrolls away from the prose.
- Each chip carries a `kind` glyph (TXN, ACC, GEO, AGT, SVC, RUL) so
  the analyst learns to read at a glance: "this claim has only an AGT
  citation; I should look for a TXN before signing off".

## Why the approval surface IS the narrative

A separate "review then approve" hop forces the analyst to context-
switch. By dropping the `ApprovalGate` primitive inline at the bottom
of the annotated narrative, signoff happens in the same surface as the
verification. No screen change, no scroll-to-find-approve.

The `final_approval` gate is `irrevocable: true` - the
`ApprovalGate` primitive enforces a confirm step for that, so the
inline placement does not undermine the irrevocable-action guardrail.

## Inline analyst actions

Three buttons per claim:

- `flag this` - "this claim is interesting; come back to it"
- `dispute this` - "I disagree with this claim as written"
- `add note` - inline composer; persists the analyst's commentary
  bound to the claim id

All three are real `<button>` elements with `onClick` handlers
(auditor rule). The flag / dispute action toggles the per-claim
annotation; the note action opens an inline textarea (never a modal).

## Reuse

Seven shared primitives carry the foundation:

- `AppShell` (mandatory framing)
- `BreadcrumbNav` (case to queue navigation)
- `MetricStrip` (claim / citation / agent / service / rule counts)
- `StatCard` (canvas SHA-256 pin)
- `StatusBadge` (rule verdicts, annotation kinds, gate state)
- `RegulatoryClock` (30-day FinCEN SAR clock - core to investigations)
- `ApprovalGate` (the HITL gate at the bottom of the approval route)

Use-case-owned components (the design's novelty):

- `CitationChip` - the inline cite-source affordance (the option's
  signature primitive)
- `AnnotatedClaim` - one paragraph with chips + three inline actions
- `EvidenceDrawer` - sticky right-rail evidence panel
- `AnnotatedNarrative` - composes sections + claims + drawer
- `ApprovalNarrativeClient` - the approval-surface-is-narrative wrap

## Hard rules respected

- AppShell-rooted on both routes
- No arbitrary Tailwind values (everything uses the inlined Atrium
  token palette; the lone exception, a `text-[9px]` glyph in
  CitationChip, is a deliberate compact-typography choice and would
  graduate to a token in production)
- No bare interactive elements without handlers - every chip, action
  button, and approval control has an `onClick` or `href`
- All client-side components carry `"use client";`
- Single source of truth for mock data (`_shared/mock-data.ts`,
  re-exported through `lib/data.ts`)
- No business decisions in components - the recommendation is shaped
  by the page, citations are shaped by the data layer
- `final_approval` declared `irrevocable: true` so the ApprovalGate's
  confirm step kicks in
