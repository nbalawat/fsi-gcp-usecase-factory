# Option C — tradeoffs

## Optimised for

- **Disposition speed.** One click on the row that surfaces the inputs;
  no context switch, no modal, no sticky bottom bar.
- **Audit explainability.** The action that closed each segment is
  recorded on the same row that displayed the inputs that triggered
  it — examiners see "approved by K. Whitfield while PD was 1.20%" with
  zero detective work.
- **Reversibility discipline.** Segment-methodology approvals are
  reversible until CFO attest is signed. The verbs match the canvas's
  `irrevocable: false` flag — no UI affordance falsely implies a hard
  commit.
- **Reuse.** Seven shared primitives carry the chrome and the
  irrevocable approval (`AppShell`, `BreadcrumbNav`, `MetricStrip`,
  `RegulatoryClock`, `StatCard`, `StatusBadge`, `ApprovalGate`).
  Novelty is in row composition, not in re-inventing the shell.
- **One irrevocable escape.** The canvas declares exactly one
  irrevocable gate (`cfo_attest_run`); the UI has exactly one screen
  that the analyst navigates to.

## Sacrifices

- **Wide rows.** The 5-column row (ring + identity + inputs + reserve +
  action) degrades on narrow viewports. Below 1024px it stacks; on a
  tablet the analyst will see a less efficient column stack.
- **No spatial stage rail.** Process is implicit in the row verdict
  badges (`ready` / `variance` / `queued` / `approved`), not a visual
  left-to-right pipeline rail. For a 4-stage quarterly close that's a
  reasonable trade; for a 10-stage workflow it would be wrong.
- **Variance Q&A is freeform.** A single textarea rather than a
  structured rationale form. Banker freedom over field-level validation
  was the explicit call.
- **Audit ledger lives below the rows, not in a right rail.** Examiners
  must scroll to see the canvas event log; the rows are the hero. If
  the auditor view is the primary use case, option D's
  conversation-timeline ordering is the right pick.
