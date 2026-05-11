# Option C — affordance axis: actions live where the data is

## Why this design fits the canvas

The CECL canvas surfaces two HITL gates of fundamentally different shape:

1. `approve_segment_methodology` — **reversible**, per-segment, owned by
   methodology / risk-analytics owners, repeated many times across the
   portfolio.
2. `cfo_attest_run` — **irrevocable**, run-level, owned by the CFO,
   happens exactly once per quarter when the allowance is posted to the GL.

A console that shoves both into a sticky bottom bar or a "review queue"
treats them as the same gesture; they're not. The reversible action
deserves to live where the data that justifies it lives — on the
segment row. The irrevocable action deserves its own surface so the CFO
sees the rolled-up artifact without competing affordances.

Option C makes this discipline visible in the layout itself: each
segment row is a one-stop disposition unit (PD/LGD/EAD inputs +
computed reserve + the action it enables, all on one line), and CFO
attestation is the only screen the user navigates to.

## How the affordance pattern shows up on every screen

- **Home** (`/`): the Q2 run is its segment list. Twelve rows, each with
  inline approve / variance Q&A. No modal opens; the variance Q&A
  expands beneath the rows inline. The CFO escape sits in the header
  and only unlocks when reversible approvals are complete.
- **Run detail** (`/case/[id]`): same segment rows as the home, plus
  the full audit ledger and rule-verdict panel — same affordance
  pattern, more context.
- **Approval flow** (`/approval/[id]`): a single-column read of what
  the CFO is attesting to, then the shared `<ApprovalGate>` primitive
  inline. No competing segment rows; the irrevocable action gets its
  own focused page.

## Reuse evidence

Seven shared primitives carry the chrome and the irrevocable gate:
`AppShell`, `BreadcrumbNav`, `MetricStrip`, `RegulatoryClock`,
`StatCard`, `StatusBadge`, `ApprovalGate`. Novelty (the "actions on the
row" pattern itself) lives in five use-case-owned components:
`SegmentRow`, `RunOverviewClient`, `AuditLedger`, `CfoAttestClient`,
`MethodologyOwnerRail`.

The shared `ApprovalGate` handles the irrevocable confirm flow on
`/approval` — there is no DIY confirm-dialog anywhere in this option.

## Where this design deliberately sacrifices

- The segment-row layout is wide on purpose (5 columns at ≥1024px). On
  narrower viewports it stacks; that's an acceptable tradeoff for the
  desktop-first risk-analytics persona, but a tablet user will see a
  less efficient column stack.
- The pipeline-stage spatial metaphor (left-to-right stage rail) is
  absent. Process is implicit in the verdict badges on each row
  (ready / variance / queued / approved). For a 4-stage quarterly run
  this trades visual axis for inline density.
