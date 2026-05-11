# Option D — rationale

## Wildcard position chosen: **feature × MCC heatmap-of-firings**

Real-time payment fraud is not a case-by-case sport. Hundreds of
transactions per second score in parallel; what the analyst needs to
see is not "which row to click" but "what pattern is firing right
now." Option D makes that question the page.

The page is a 2D grid:

- **rows** = the model's top fraud features (velocity-5m, geo-jump,
  new-device, amount-outlier, card-present mismatch, CVV-retry,
  off-hours, high-risk MCC)
- **columns** = merchant category codes (grocery, electronics,
  pharmacy, ATM, gambling, wire/crypto, …)
- **each cell** = count of non-approve firings (decline + step-up)
  whose contributing features lit up both axes

Intensity is a six-step ramp from white through warm yellow to deep
red. The reader's eye is drawn directly to the bright cells; a single
click opens the firings inside that cell.

## Why this is genuinely orthogonal to A / B / C

| Option | Anchor | Primary metaphor |
|--------|--------|------------------|
| A (sparse-density) | minimal chrome, one big number | the SCORE is the page |
| B (model-first)    | model card + confidence | the MODEL is the page |
| C (inline-affordance) | row-level buttons | every TRANSACTION is the page |
| **D (heatmap)**    | population grid | the FIRING SHAPE is the page |

D is the only one where the *collection* of firings — not any
individual firing, not the score, not the model — is the primary
metaphor. It is the only view that lets you see attack-wave behaviour
at a glance, and the only one where moving from population to case to
population is a two-way affordance built into the routing.

## Why heatmap-first satisfies the five agentic-UI principles

1. **Event-spine-first** — every cell value is a pure tally over the
   firing stream. Adding a firing increments cells; the spine drives
   the surface.
2. **Process as primary metaphor** — the "process" for fraud is the
   shape of the firing population over a sliding window. The heatmap
   IS that shape.
3. **Agent activity visible live** — every event row shows the model's
   score and confidence; the per-event drill-in foregrounds them.
   The decision rail shows step-ups and declines streaming through.
4. **Audit trail as SOP** — every number on the page is a count of an
   underlying event, not a derived ratio. An auditor can replay the
   stream and reproduce every cell.
5. **Human in the loop** — this canvas has 0 HITL gates by design
   (sub-second decisions, no human approval), so the human-in-the-loop
   role is *investigative* rather than *transactional*. The heatmap
   gives the analyst the levers to investigate without ever
   approving/declining anything in the UI.

## What no other designer would do here

Three real-time fraud designs converge on the same shape: "a fat
table of transactions with a colour-coded score column." Option D
does not show a row-per-transaction list as its hero — the row-per-
transaction stream is in the right rail, intentionally subordinate to
the population grid. This is the unusual call.

The other call: features link **back** to their cells. The event
forensic card's contributing-feature pills are not text; they are
deep-links into the home page's heatmap cell. Two-way navigation
between population and case is the design's signature affordance.

## Reuse discipline

Five framework primitives carry the chrome and the metrics:

- `AppShell` — header, nav, scaffolding
- `BreadcrumbNav` — back-to-floor link from the event page
- `MetricStrip` + `Metric` type — top-of-page totals
- `StatCard` — canvas SHA pin + provenance
- `StatusBadge` — decision verbs (approve / step-up / decline), stage chips

The novelty — `HeatmapGrid`, `HeatmapCellDetail`, `DecisionStreamRail`,
`EventForensicCard` — is use-case-owned and lives under
`components/`. They render data only — no scoring math, no thresholds
applied, no decisions changed. The agent and the rules service own
those.

## Hard-rule compliance

- AppShell-rooted: both routes wrap their content in `<AppShell>`.
- No arbitrary Tailwind: every utility is a token (`bg-heat-3`,
  `text-ink-1`, `border-rule`). The heat ramp is tokenised in
  `tailwind.config.ts` (`heat.0` … `heat.5`).
- No bare interactive elements: every cell is a real `<button>` with
  `type="button"`, `aria-pressed`, `aria-label`, `title`, and an
  `onClick`. Disabled (empty) cells set `disabled` so the keyboard
  skips them. Every right-rail row is an `<a>` with `href`.
- Client components: `HeatmapGrid` and `HeatmapCellDetail` declare
  `"use client"`. The rest are server components and import nothing
  client-only.
- Mock data is `_shared/mock-data.ts` (read-only). All derived values
  live in `lib/data.ts` as pure shape transforms.

## Why the firing-stream is deterministic

The proposal's `buildFiringStream()` returns a fixed list of 20
firings derived from a typed seed table. No `Math.random()`, no
`Date.now()`, no per-request mutation. This is required so the
heatmap auditor (and Playwright) can assert the page renders the
same cell counts on every run.
