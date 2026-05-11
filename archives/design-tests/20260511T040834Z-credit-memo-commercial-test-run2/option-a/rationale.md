# Option A — rationale

## Variation axis chosen: **density (sparse-executive)**

The persona is a Chief Credit Officer who scans 8-12 cases / day for
~30 seconds each before deep-reading the one or two with adverse
signals. The CCO does not need to see every agent reasoning or every
service call — they delegate that to the analyst, the underwriter, the
senior underwriter. What the CCO needs is **the recommendation, the
risk band, and one sentence of why**, available without scrolling and
without a click.

So the page IS the decision card. The artifact (borrower title +
recommendation verb + risk-band badge + one-sentence rationale + four
signal counts) is the only thing rendered above the fold; everything
else — gate pill row, rule verdicts, regulatory clock — is sparse
support material below or in a 14-rem right rail.

## Why sparse-executive satisfies the five agentic-UI principles

1. **Event-spine-first** — the spine compresses to four signal counts
   ("4 services · 5 agents · 3/4 gates · 3/4 rules pass") rendered as a
   single line in the decision card. The thin top <WorkflowStageRail>
   shows the process moving through the canvas's nine stages.
2. **Process as primary metaphor** — the WorkflowStageRail at the top
   makes the pipeline shape always visible; the <StepProgress> on the
   approval page makes the gate progression always visible.
3. **Agent activity visible live** — surfaced as the "Agent reasonings:
   5" counter in the decision card. Live execution is one number; deep
   detail moves to a forensic option.
4. **Audit trail as SOP** — the rule-verdict strip below the card
   carries every shared rule (DSCR, Leverage, Single-borrower, Reg O)
   with its verdict badge inline. Citation chasing is delegated to the
   analyst gate.
5. **Human in the loop** — every HITL gate appears in the GatePillRow;
   pending gates have a warning badge; approval-flow page renders the
   shared <ApprovalGate> at full width with no distraction.

## What no other designer would do here

No other density axis produces this artifact: a case page where THE
RECOMMENDATION IS THE PAGE. Density-balanced (option B) shows three
columns side by side; density-rich (option C) shows the full canvas in
detail; wildcard (option D, the Tier-1 winner) shows the conversation
transcript. Only sparse-executive collapses the case to a single hero
card with three KPIs and a tiny right rail — the way a CCO actually
consumes it.

## Reuse discipline

NINE shared primitives carry this design:

- `<AppShell>` — chrome (mandatory)
- `<BreadcrumbNav>` — case → live floor breadcrumb
- `<MetricStrip>` — three KPIs only (Exposure, AI recommendation, Gates decided)
- `<StatCard>` — canvas pin + sign-off authority (right rail)
- `<StatusBadge>` — risk band, rule verdicts, gate dispositions
- `<WorkflowStageRail>` — thin top rail, process metaphor
- `<RegulatoryClock>` — SR 11-7 review window (right rail, case page)
- `<StepProgress>` — gate progression (approval page header)
- `<ApprovalGate>` — full-bleed signoff surface on the approval page

Three use-case-owned components carry the sparse orchestration:
- `ExecutiveDecisionCard` — the hero artifact
- `GatePillRow` — the four-pill HITL summary (anchors on case page,
  tabs on approval page; one component, two modes)
- `GateApprovalClient` — the approval-page client wrapper

All data flows in pre-shaped from `lib/data.ts` (read-only re-export
from `_shared/mock-data.ts`). No thresholds computed, no decisions
made, no math in components — architecture-auditor compliant.

## Typecheck status

Code is authored against `@fsi-bank/components`; all the imports
resolve to existing exports in `ui/packages/components/src/index.ts`.
The mock data is imported via relative path `../../_shared/mock-data`
(read-only) so no duplicate source of truth is created. The
Dockerfile vendors `ui/packages/components/src/` into
`./_vendor/components/src/` at build time so the standalone bundle
resolves cleanly without a workspace dependency.
