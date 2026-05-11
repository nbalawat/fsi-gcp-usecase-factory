# Option B — model-first metaphor

## The seed

> The model IS the page. Show the model's behavior live: which features
> are firing, what's the score distribution, where's the drift trend.
> Every transaction is a sample contributing to the model's curve; the
> UI shows the curve, not the transactions. Decisions are byproducts of
> the model — the page is a model-health monitor with the latest score
> event on top.

## What the page surfaces

| Surface             | What it answers                                    |
|---------------------|----------------------------------------------------|
| `ModelHero`         | Where is the score distribution sitting right now? |
| `FeatureFilterBar`  | Which inputs are firing? Are any drifting?         |
| `SampleContribution`| For one sample on the curve — why this score?      |
| `LiveTicker`        | Is the sub-second budget being kept?               |
| `MetricStrip`       | p99, agent share, 24h drift, this score, model id  |
| `PolicyTuneClient`  | The human-in-the-loop surface — policy, not cases  |

## Why "model-first" for real-time fraud

The canvas declares:

- **1 agent**, invoked only in the gray band (~4–8% of traffic)
- **2 atomic services** (velocity-feature-builder, geo-risk-scorer)
- **0 per-transaction HITL gates** — sub-second p99 leaves no room
- **Vertex Gemini** for the gray-zone scorer
- **Advisory compliance scope** — humans don't approve transactions

The natural primary surface for an ML-ops persona is therefore the
MODEL, not any individual transaction. The model is what they own.
Every transaction is one sample on its curve.

## How HITL is honestly represented

Per the canvas, there is no per-case approval. The brief asks the
approval route to be "a model-policy-tuning surface (since real-time
has no HITL — humans tune rules, not approve cases)" — we take that
literally:

- The approval route lists every tunable policy threshold
  (`velocity_threshold_by_mcc` per MCC, `decline_band_floor`,
  `approve_band_ceiling`).
- The operator picks one, types a proposed value, sees the pre-shaped
  diff, and submits via the shared `ApprovalGate` primitive.
- The component does NO decision math — the diff is pure subtraction;
  the recommendation copy is pre-shaped at the page level, not
  generated client-side.
- Every threshold change is recorded as an audit event via the same
  primitive every irrevocable banking action uses.

This satisfies the platform rule: **every irrevocable action goes
through the approval queue** — here the "irrevocable action" is a
policy change, not a transaction decision.

## Reuse

Six shared primitives carry the foundation (AppShell, BreadcrumbNav,
MetricStrip, StatCard, StatusBadge, ApprovalGate). The novelty is in
the use-case-owned visualisations that make the model's behavior
visible (ModelHero histogram, FeatureFiringList, SampleContribution
signed-weight bars).

## What it gives up

- The individual transaction is intentionally NOT the unit of
  attention. Investigators looking for one card's history would need
  to navigate elsewhere (the search box in AppShell or a dedicated
  surveillance view).
- No spatial pipeline rail. The flow is sub-second; there are no
  stages worth pinning.
- Per-feature drill (PDP / SHAP plots) is summarised at the
  firing-rate-plus-drift level. This is a model health monitor, not
  an evaluation harness.
