# Option A — tradeoffs

## Optimised for

- **30-second executive read.** Recommendation, risk band, and a single
  sentence of rationale are visible without scrolling; the four signal
  counts on the bottom of the decision card answer "should I trust
  this?" in one row of numbers.
- **Decision-card-IS-the-page.** There is one artifact above the fold,
  not a dashboard. Every pixel in the page hero is the case
  recommendation; chrome compresses to a thin top rail and a 14-rem
  right rail.
- **Reuse density.** Nine shared primitives carry the chrome, the
  process rail, the clock, the metrics, the badges, and the signoff
  surface. Only three use-case-owned components carry the
  orchestration.
- **Cohesion across case and approval pages.** Both pages render the
  same `GatePillRow` (anchors on case page, tabs on approval page);
  both share the same 14-rem right rail layout; the StepProgress on
  the approval header mirrors the gate state of the case page.

## Sacrifices

- **No agent reasoning surface.** The case page shows agent
  reasonings as a count ("5") only — there is no
  AgentReasoningPanel, no per-agent tile, no live activity stream.
  Anyone who needs to chase reasoning has to click through to a
  drill-in (a separate option entirely).
- **No transcript / event timeline.** The chronological spine is not
  visible on this view. The case page tells the EXECUTIVE result, not
  the FORENSIC trace. Audit reviewers will reach for option D (the
  conversation transcript winner).
- **No citation drill-in.** DSCR and leverage values do not appear as
  numbers on this page — only as "DSCR · pass" badges. Anyone who
  wants to see the underlying ratio reaches for a different view.
- **Data-density power-user view absent.** The page deliberately
  refuses to surface the spreadsheet. Underwriters who think in
  numbers will be unhappy; that is the cost of sparse-executive
  density.
- **The approval page asks one question only.** There is no
  "before-and-after" panel, no transcript scope, no rules table on
  the right of the gate. The exec sees the recommendation card and
  the three signoff buttons. Reviewers who want the work shown next
  to the signoff will reach for option B (density-balanced) or
  option D (conversation-transcript).
- **Vertical scroll is finite.** This page is intentionally short
  enough to fit on a laptop without scroll. Use cases with many more
  signals (covenant exposure waterfalls, multi-borrower groups) would
  outgrow this density and need option C.
