# Tradeoffs — option C

## Optimised for

- **Throughput.** Inline buttons next to the rationale = one click
  per reversible disposition. A bullpen RM rapid-firing through
  30+ recommendations / hour pays no modal-open / dialog-confirm
  tax.
- **Audit clarity.** The accepted recommendation's disposition is
  visually anchored to the rationale that produced it — the
  spatial pairing tells the auditor *which* rationale the banker
  accepted, not just that they accepted something.
- **HITL discipline.** Reversible vs irrevocable is a hard visual
  split: reversible is inline (cheap, undo-able); irrevocable is a
  dedicated route with a confirmation dialog and explicit copy.
- **Reuse.** Six shared primitives carry the foundation
  (AppShell · BreadcrumbNav · MetricStrip · StatCard · StatusBadge
  · ApprovalGate). The use-case-specific surfaces are tightly
  scoped: InlineDispositionRow + QueueBoard + QueueFilterTabs +
  TimelineList + GateRoster + SendToCustomerClient.
- **Self-contained build.** All primitives are inlined under
  `./primitives/`. No `_vendor` symlinks; no workspace-package
  copy step; `npx next build` works at the option root.

## Sacrifices

- **Deep rationale.** The inline card has space for ~one line of
  rationale and three score chips. A use case that needs a
  multi-section explainability tree should use a side-drawer
  pattern (option-B style) or a row-explode pattern.
- **Lateral comparison.** Because the disposition surface lives on
  each card, there is no global "compare these three side by
  side" affordance. The user is processing one recommendation at
  a time.
- **Visual variety.** The queue is intentionally monotone — same
  card shape, same button positions. A demo prefers visual drama;
  this pattern privileges muscle-memory throughput over hero
  moments.
- **No batched disposition.** There is no "accept all selected"
  affordance — the discipline is per-recommendation. A use case
  with very high false-positive density and a "clear the noise"
  pattern would want bulk select.

## What option C is NOT for

- Wealth rebalancing where every recommendation needs DCF, drift
  scenarios, and a per-holding rationale tree.
- Syndicated loan waterfalls where the disposition includes a
  pricing override field.
- Operations workflows where the human triggers a multi-step
  walk (sign → notarize → file).

## Build verification

`npx next build` from the option root produces the standalone Next.js
bundle. The Dockerfile builds the image directly from the option
directory — no `_vendor` copy, no workspace resolution.

Post-build cleanup removes `.next/` and `node_modules/` from the
worktree per Rule 38.
