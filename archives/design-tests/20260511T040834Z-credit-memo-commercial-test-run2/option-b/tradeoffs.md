# Option B — tradeoffs

## Optimised for

- **Spatial comprehension of the pipeline.** Stages are visible at one
  glance via the shared `WorkflowStageRail`; the active one is
  highlighted by the primitive itself. The reviewer never has to ask
  "what stage is this case in?"
- **Stage-scoped focus.** The hero panel shows ONLY the events that
  fired in the current stage. Done stages compress to pills; queued
  stages dim. The cognitive load on a specific stage is small.
- **Cross-page consistency.** Both case detail AND approval flow use
  the same `WorkflowStageRail` as a header spine. The reviewer's mental
  model of "where in the pipeline am I" never changes between routes.
- **Reuse.** Eight shared primitives. The `WorkflowStageRail` is the
  load-bearing spine (the constraint called it out as the perfect fit);
  the `ApprovalGate` is the only place a HITL disposition is captured.

## Sacrifices

- **Story-as-time-axis is indirect.** Events are bucketed BY stage, not
  laid out as one chronological column. A reviewer who wants to read
  the case as one continuous transcript will reach for a different
  option.
- **Numeric hero is absent.** DSCR / leverage / exposure show up only
  as rule verdicts. Power users who want the numeric KPIs front-and-
  centre will reach for a data-first option.
- **Three-column layout.** The 3-col `prior · hero · future` shape
  shines at `lg+`; at `sm` it stacks vertically and the visual spine
  carries the metaphor on its own. No `xs`-specific design — the
  WorkflowStageRail's built-in horizontal scroll handles narrow
  screens.
- **Memo PDF is not the centerpiece.** Anyone who thinks of credit as
  "approve the memo" will need to re-orient: here you approve the
  stage that PRODUCED the memo.
- **Per-stage bucketing is the discrimination axis.** Stages with zero
  events (skipped or never-entered) still show on the rail and on the
  future list — the workflow shape is preserved over event-density.
