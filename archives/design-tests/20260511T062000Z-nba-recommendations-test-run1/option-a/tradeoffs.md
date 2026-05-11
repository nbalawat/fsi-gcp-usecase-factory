# Option A — trade-offs (density axis)

## Optimised for

- **Throughput.** Dense table → 50-200 rows on one viewport (with
  scrolling) → no pagination → no lost context when scrubbing.
- **Triage efficiency.** Three buttons per row + inline state
  transitions → one click closes the loop on reversible actions.
- **Audit clarity.** Every row carries canvas-pinned fields
  (`uplift_score`, `fit_score`, `regulatory_clear`, expiry); the agent
  trail is one drill-in away on `/case/[id]`.
- **Reuse.** Seven shared primitives carry the chrome; six net-new use-case
  components carry the row composition + page choreography.

## Sacrificed

- **Per-row visualisation.** No charts, sparklines, or peer-benchmark
  graphics on the row. That's `/case/[id]` material.
- **Workflow-stage spatial metaphor.** The pipeline rail (left-to-right
  stage progression) is reduced to a single status chip in the header.
- **Real-time motion.** Triage operators want stability; rows do not
  reorder under the cursor and there is no SSE animation. (If we
  needed live throughput, this would be a `console-realtime` design,
  not `console-recommendations`.)
- **Multi-recommendation grouping.** Each row is one rec for one
  customer. We do not collapse "all 3 recs for Ford" into one row;
  that would hide the disposition state and force a drill-in.

## When this design is the wrong choice

- If the recommendations require deep, multi-page reasoning before the
  RM can decide (e.g. wealth-rebalancing scenarios with multi-leg
  trade impact), the row is too thin — pick a card layout instead.
- If the queue is < 10 recs/day (long-tail, high-touch), the density
  optimisation has no payoff — pick a card layout that gives each rec
  a full visual surface.
- If real-time motion matters (rec expires in seconds, not hours),
  pick the realtime console pattern.

## What we measure

- Median time-to-disposition per row (target: < 30s for reversible
  dispositions, < 90s for accept-then-send).
- Pending queue depth at end of day (target: < 5% of start-of-day
  load).
- Override rate (accept rate / dismiss rate, tracked by analytics) —
  the model feedback loop the canvas is designed to close.
