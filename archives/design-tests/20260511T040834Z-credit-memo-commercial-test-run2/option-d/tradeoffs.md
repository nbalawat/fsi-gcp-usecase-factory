# Option D run-2 — tradeoffs

## What this design wins on

- **Forensic verification** — "where did this number come from?" is
  always one click. For an examiner reading the case for the first
  time, the page IS the audit artifact.
- **Risk surfacing** — low-confidence extractions are first-class:
  one filter tab, one summary KPI, and the trust-attestation view
  sorts the subtree lowest-confidence first.
- **Causation over chronology** — readers see what fed what, not when
  it happened. This matches how risk officers actually think when
  reviewing a credit decision after it's already made.
- **Reuse density** — six shared primitives carry the chrome and the
  signoff; all five new components are pure orchestration over the
  same canvas data.

## What this design sacrifices

- **No spatial pipeline metaphor.** A reviewer who wants to see
  "where in the workflow are we" has to read the stage chip in the
  header, not a left-to-right rail. The "Open trust attestation"
  link routes to the gate view for HITL context.
- **No chronological story.** Anyone who wants to read the case as a
  postmortem in time order needs the run-1 conversation-timeline
  view. Provenance-graph reorders by data dependency, not time.
- **Higher visual density than sparse-density (A).** Every value card
  carries its citation excerpt and edge counts inline. This is the
  point — but it means the page is heavier than a KPI dashboard.
- **Default selection bias.** The right-rail inspector opens to the
  lowest-confidence extraction by default. That's right for an
  examiner but biased for a happy-path demo; a `?node=` query param
  overrides.

## Where another option would beat this one

- **Sparse-density (A)** wins for "scan twelve cases in five minutes".
- **Workflow-first (B)** wins for "what stage is this case in".
- **Inline-affordance (C)** wins for "fix a typo on the memo without
  leaving the page".
- **Conversation-timeline (run-1 D)** wins for "tell me the story of
  how this case got here".

This design wins for **"prove this decision was correct"**.
