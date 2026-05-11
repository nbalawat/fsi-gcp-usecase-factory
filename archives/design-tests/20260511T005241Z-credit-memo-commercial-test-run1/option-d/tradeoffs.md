# Option D — tradeoffs

## Optimised for

- **Story comprehension.** A new analyst can read the case top-to-bottom
  and understand what happened, in what order, by which actor, without
  ever opening a "show reasoning" drawer.
- **Audit explainability.** Every Pub/Sub event is one row with a
  timestamp and an actor; there is no second "compliance view" to
  build.
- **Inline disposition.** The HITL gates appear in the timeline at the
  moment they fired; "Respond →" deep-links to the approval flow's
  scope for that gate.
- **Cohesion between case detail and approval flow.** Both pages use
  the same `TranscriptRow` primitive; the approval flow is the case
  detail filtered to one gate's scope. There is no second mental model
  to learn.

## Sacrifices

- **Per-metric density** (DSCR, leverage, exposure values) is reduced
  to summary counts in the top strip. Power users who want the numeric
  hero will reach for a different option.
- **The memo PDF is not the centerpiece.** Anyone who thinks of credit
  decisions as "approve the memo" will need to re-orient: here you
  approve the conversation that produced the memo.
- **Vertical scroll dominates.** Reviewing 50 cases at a glance is not
  what this shape is for — it's a single-case deep view.
- **Pipeline-stage spatial metaphor is absent.** No left-to-right rail,
  no stage columns. The stages still appear (as `stage_entered`
  system rows) but as moments in time, not as spatial buckets.
- **Filtering, not search.** The actor filter lets you scrub by type
  (agents / humans / services / gates), but there is no full-text
  search over the transcript in this option.
- **Citation surface is light.** Each agent row carries a `ref:` field
  pointing at the agent id; deeper citation chasing (PDF page + bbox)
  is intentionally NOT the spine of this view — that is a forensic
  deep-dive option, not a conversation option.
