# Option B — rationale

## Variation-axis position: **metaphor (regulatory-clock-first)**

The 30-day SAR clock IS the page. The shared `<RegulatoryClock>`
primitive sits at the top of every viewport, live-ticking, with the
elapsed bar and the days/hours/minutes countdown rendered at the largest
type size on the page. Every section below it is positioned on the
30-day axis by "days remaining". Every individual event row carries a
days-remaining anchor in its left rail.

This is genuinely different from any axis a peer designer is likely to
take on this canvas:

- **Density-first** would make the structuring-signal table the hero
  and reduce the clock to a chip.
- **Affordance-first** would make the "File SAR" button the hero and
  push the clock to the rail.
- **Wildcard / transcript-first** would render the case as a flat chat
  log without a temporal scaffold.

A clock-first metaphor optimises for the moment-of-truth the BSA
Officer actually inhabits: "I have N days left. What has happened so
far, what still has to happen, and what do I have to do right now?"

## Why clock-first satisfies the five agentic-UI principles

1. **Event-spine-first.** Every Pub/Sub event from `PIPELINE_EVENTS`
   becomes one row. No event is dropped, no event is invented.
2. **Process as primary metaphor.** The process IS the clock; the
   reader walks the case along the day axis. `WorkflowStageRail`
   provides the secondary spatial cue beneath the clock.
3. **Agent activity visible live.** Each `agent_invoked` event is its
   own row with tokens-in / tokens-out and a ref for drill-in. The
   `RegulatoryClock` itself live-ticks.
4. **Audit trail as SOP.** Every event has timestamp + actor + days
   remaining when it occurred — examiner-ready by construction.
5. **Human in the loop.** The one HITL gate (`final_approval`) is
   rendered inline at the bottom of the clock-scoped slice; its
   pending-state row records the days-remaining-when-raised value
   so the auditor can see the regulatory cushion at signoff.

## Reuse discipline

Eight framework primitives carry the chrome and the signoff:
`AppShell`, `BreadcrumbNav`, `MetricStrip`, `StatCard`, `StatusBadge`,
`RegulatoryClock`, `WorkflowStageRail`, `ApprovalGate`. The novelty is
in **orchestration**, not in re-implementing primitives: three
use-case-owned components (`ClockSectionList`, `ClockEventRow`,
`ClockApprovalClient`) render data, nothing else — no thresholds
computed, no decisions made.

## Typecheck status

Code is authored against `@fsi-bank/components` per the option's
`tsconfig.json`. All imports resolve to existing exports in
`ui/packages/components/src/index.ts`. The mock data is imported via
the relative path `../../_shared/mock-data` (read-only). Local `tsc
--noEmit` was not run inside this worktree because the proposals
directory is not wired as a standalone Next app outside the Docker
build; the parent agent's typecheck is the authoritative gate.
