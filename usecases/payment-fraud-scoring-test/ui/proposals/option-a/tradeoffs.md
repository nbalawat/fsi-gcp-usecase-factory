# Tradeoffs · option A

## Optimised for

- **Throughput comprehension.** A 1080-tall window shows ~36 rows + the
  KPI band + the header. At 200 tx/sec that is ~180ms of decisions on
  screen at any moment — enough to feel the pulse without being
  overwhelmed.
- **Sub-second scan.** Every row is the same width, the same height, the
  same typography. The Lead's eye locks onto a column (verb · score ·
  amount) and runs vertically.
- **Decline rate as the headline.** The single number the bank's risk
  committee wants visible at all times sits in the leftmost KPI tile in
  serif 28px.
- **Drill-down audit.** Whole-row `<Link>` → /case/[id] → score factors
  + agent reasoning. Two clicks gets from "that decline looks wrong" to
  "here is the factor that drove it".
- **Step-up disposition audit.** The 0-HITL constraint is honored
  explicitly: /approval/[id] is a step-up challenge queue, not a fake
  approval page.

## Sacrifices

- **No "agent thinking" tile on the home page.** The agent reasoning
  lives one click away on /case/[id]. Density 1 means the stream wins
  the home page; the per-row "top factor" hint is the in-line teaser.
- **No 2D state grid.** A surveillance-style heatmap of MCC × geo would
  be useful for trend hunting; throughput beats cross-section for this
  persona.
- **No workflow-stage rail.** The real-time process has 4 stages
  (received → scored → decided → settled) and they fly past in <800ms.
  A spatial rail would waste pixels.
- **No sparklines on KPIs.** Keeping the KPI band under 90px tall meant
  dropping the StatCard sparklines. A 30-second trendline could be
  added beneath each tile if vertical budget allows.
- **No fancy live-stream animation.** Only the most-recent 4 rows
  highlight (400ms fade). No marquee, no auto-jump. The seed says
  "chrome is invisible"; motion is chrome.

## What the other axes would have done differently

- **Density 3 (sparse executive)** would have devoted half the screen
  to a hero KPI + a 12-row recent-decisions table — easier on the eye,
  worse for line-rate watching.
- **Density 2 (balanced)** would have added a right-rail context panel
  with the agent reasoning preview — useful at 50 tx/sec, distracting
  at 200.
- **Wildcard (e.g. a stream-of-thought transcript)** would have made
  per-decision audit easier but lost the throughput overview.

Option A bets on the seed's commitment: the Lead's job is to *feel the
flow*, not to read individual decisions. The /case route exists for the
moment they need to.

## Open questions for the judge

1. Should the live floor have a per-stage horizontal mini-bar (received
   / scored / decided / settled) to make the agent-activity principle
   more visible at the home level? Option A's bet: the per-row latency
   column already covers this; a stage rail would duplicate.
2. Should /approval/[id] expose a "force-pass" or "force-fail" action
   on a challenged row? Option A's bet: no — that would invent a HITL
   path the canvas does not authorize.
3. The drift gauge is computed as tokens_out / tokens_in from the
   canvas's first agent event. Real drift would be a population-stat;
   the canvas should grow a `drift_score` event so this number stops
   being a proxy.
