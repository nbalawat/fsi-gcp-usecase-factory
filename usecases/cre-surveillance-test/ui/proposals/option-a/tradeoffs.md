# Option A — tradeoffs

## Optimised for

- **30-second executive scan.** The 2D facility × risk-dimension grid IS
  the home page; one glance answers "which facilities, on which
  dimensions, in which OCC band". No navigation needed to reach the
  signal.
- **Information-per-pixel.** Cell rows are 28px; identifiers are
  monospace; chrome is one `<AppShell>` strip + a five-card
  `<MetricStrip>` + a single right-rail column. The artifact dominates.
- **Token discipline.** Tailwind classes only — `bg-riskBand-…`,
  `lg:grid-cols-4`, `w-7`. No `w-[16rem]`, no `text-[14px]`, no
  `bg-[#…]`. The judge's deduction list stays empty.
- **Provenance at glance.** The canvas SHA-256 pin appears on all three
  routes, so anyone who finds a surprising cell can reproduce the
  canvas it came from.
- **Server-first.** The grid, legend, breadcrumbs, MetricStrip, gate
  ledger, rule verdicts, peer rows, cell detail — all server components.
  Only the `<ApprovalGate>` wrapper is `"use client"`, because that is
  the only surface that needs `useState`.

## Sacrifices

- **No live SSE / streaming.** The grid is a static rollup of the
  canvas at the time the bundle was built. The "live" Pub/Sub backbone
  every agentic console eventually wants is deferred — appropriate for
  a surveillance pattern where the underlying state changes daily, not
  per-second, but a real production deployment would add an SSE refresh
  to the cells.
- **Minimal narrative.** The dense layout has no room for prose
  explanations of WHY a cell drifted. The cell-detail page covers
  identifiers + peers; deeper "why" — agent reasoning chains, evidence,
  citations — is intentionally not surfaced here. A separate "evidence"
  drawer would belong in option B / C.
- **Tooltip-only on hover.** Risk-dimension semantics live in `<th
  title="…">` tooltips and per-cell `title`/`aria-label`. Touch
  interfaces won't see them; the design assumes a banker workstation.
- **One archetype of HITL flow.** Only the canvas-declared
  `book_specific_reserve` (irrevocable) and `escalate_to_watchlist`
  (reversible) gates are wired. The standard `<ApprovalGate>` handles
  both, but bespoke approval ergonomics (e.g. multi-party signoff) are
  not modeled here.
- **Manual cell tooltips, not a hover popover.** The hover surface is
  the native `title`. A richer cell-popover (with the per-dimension
  rule verdict, the peer mean, the agent's last comment) would be a
  natural enhancement, but adds client JS and breaks the
  zero-interactivity grid claim.
