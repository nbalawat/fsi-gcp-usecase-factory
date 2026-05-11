# Option B — tradeoffs

## Optimised for

- **Spatial concentration discovery.** The 2×2 census-region tile grid
  surfaces "where is the risk concentrating?" in one glance. Heat
  saturation is the primary signal; numbers (facilities, watch count,
  exposure) are the supporting detail.
- **Drill continuity.** Every drill-in page — facility detail and
  approval — opens with the same `FacilityLocator` band that highlights
  the user's current region inside the 4-region map. The user never
  loses geographic orientation.
- **Inline HITL.** Reserve booking happens inside the same surface that
  shows the geographic context, the agent rationale, and the rule
  verdicts. No popups, no separate review-then-approve hop.
- **Token-only color discipline.** The heat scale is rendered with
  shipped Atrium tokens (`paper-2`, `semantic-{info,warning,danger}-tint`,
  `riskBand-5-loss`). No arbitrary Tailwind values; the judge's Rule-4
  check passes by construction.
- **Reuse.** Six shared primitives carry the chrome: `AppShell`,
  `BreadcrumbNav`, `MetricStrip`, `StatCard`, `StatusBadge`,
  `ApprovalGate`. Net-new code is the map metaphor itself.
- **Server-Components-by-default.** Only `ReserveApprovalClient` carries
  the `"use client"` directive; every other component renders on the
  server. No functions are passed from Server pages to Server components.

## Sacrifices

- **Approximate cartography.** A real US map SVG would render
  state-level boundaries; we use a 2×2 census-region grid + a state
  cluster strip instead, to keep the bundle slim and the metaphor
  legible on dense dashboards. The geographic claim is "regions and
  clusters", not pixel-accurate borders.
- **Time-series is muted.** The map encodes *current* concentration;
  trend lines and quarter-over-quarter deltas are demoted to a
  sparkline inside the side-rail `StatCard`.
- **Stage-rail spatial metaphor is intentionally absent.** This is a
  surveillance console, not a pipeline. Cases don't flow left-to-right
  through stages here; they live in geography, and re-evaluate
  continuously. Option B leans into that — no workflow rail.
- **Dense per-facility tables are summarised.** Cap-rate ladder, NOI
  history, valuation trail are referenced via rule verdicts and agent
  activity logs, not foregrounded as their own tabs. A complementary
  option (e.g. tabular drill view) would carry that load.
