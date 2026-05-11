# Option D — tradeoffs

## Optimised for

- **Population pattern detection.** The analyst can see attack waves
  the moment one cell goes red — without scrolling through hundreds of
  individual decisions.
- **Two-way navigation.** Cell → events → cell. The contributing-
  feature pills on the event page are deep-links back to the
  corresponding heatmap cells, so the analyst moves fluidly between
  population view and case view.
- **Audit explainability.** Every number on the page is a count of an
  underlying event, not a derived ratio or a threshold check. An
  auditor can replay the firing stream and reproduce every cell value.
- **Decision transparency.** Decision verbs (approve / step-up /
  decline) get a coloured `StatusBadge` everywhere they appear; the
  decision distribution is one glance on the metric strip.

## Sacrifices

- **Per-event detail is secondary.** Readers who think first in "which
  transaction" must look at the right-rail decision stream; the page's
  hero is the population, not the row.
- **Fixed axes.** The grid is 8 features × 8 MCCs. The model fires on
  many more features in production; this view summarises. A separate
  forensic option would show the full feature vector per event.
- **Quiet cells != no traffic.** Approve-only firings are intentionally
  not counted in cell intensity. A pale cell means "no fraud signal,"
  not "no transactions" — this is a deliberate framing choice that
  helps spot fraud waves but hides volume waves.
- **No SLA-clock anchor.** The real-time console pattern would
  normally surface a P50/P99 latency rail and a backlog meter — these
  live in a sibling option, not here.
- **No row-level disposition.** With 0 HITL gates by design, this
  console is read-only; analysts use it to investigate, not to act.
  An adjacent recommendations console (sibling pattern) would be
  needed for any step-up adjudication.
- **8×8 grid forces summarisation.** If a feature fires off-axis (e.g.
  a new feature added by the model card after deploy), it is not
  visible until the axis is updated. This is the trade for a
  scannable surface.
