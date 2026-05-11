# Option B — tradeoffs

## What this option optimises for

- **Persona alignment** — the ML-ops operator owns the model, reads the
  page to verify the model is behaving. Every primary surface answers
  a model-health question.
- **Distribution-first reasoning** — the score histogram makes the band
  cuts (approve / gray / decline) visible at a glance. Drift in the
  per-bucket counts shows up immediately.
- **Sub-second emphasis** — p99 latency is in the metric strip; the
  live ticker pins each event to a millisecond clock so the operator
  can see the budget being kept.
- **Honest HITL framing** — real-time fraud has zero per-transaction
  HITL gates (sub-second p99). The approval route is therefore the
  policy-tuning surface, not a fake per-case approval queue. This is
  consistent with the canvas declaration.
- **Reuse discipline** — six shared primitives (AppShell,
  BreadcrumbNav, MetricStrip, StatCard, StatusBadge, ApprovalGate)
  carry the foundation; the novelty is in the use-case-owned
  visualisations.

## What this option gives up

- **Individual-transaction navigation** — the page is the model, not
  the case. Investigators looking for one card's history would need
  to navigate elsewhere (AppShell search, or a dedicated investigation
  view). The case route shows one sample on the curve, not a card's
  full history.
- **Pipeline spatial metaphor** — there is no left-to-right stage
  rail. Real-time flow is sub-second and has only three stages
  (ingest → score → decide); a spatial pin doesn't pay for itself.
- **Time-windowing** — the histogram is a "last hour" snapshot; no
  slider for shorter or longer windows. Time-windowing belongs in a
  dedicated ops view, not the live page.
- **Evaluation depth** — per-feature drill is at the firing-rate +
  drift summary level. PDP / SHAP / counterfactuals belong in a
  separate evaluation harness, not the live model-health monitor.
- **Density** — the page is intentionally minimal (density score 3 of
  5). A power-user dashboard view would want more numbers per square
  inch; this view trades density for legibility because the persona
  scans the page repeatedly through the day.

## When NOT to pick this option

- If the primary persona is a fraud investigator working specific
  cases, pick the case-first or transcript-first variant instead —
  this option treats individual transactions as samples, not subjects.
- If the use case has per-transaction HITL gates (it doesn't, but
  hypothetically), this option's approval route would need to be
  reworked — the policy-tuning surface assumes the canvas is honest
  about its lack of per-tx HITL.
- If the model is a black-box external provider with no exposed
  features, the FeatureFiringList becomes empty and most of the
  page's value evaporates. This option assumes the bank owns the
  model and can see inside it.
