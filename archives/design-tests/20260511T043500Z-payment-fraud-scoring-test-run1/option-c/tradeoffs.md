# Tradeoffs — option C (decline-reason-actionable)

## Optimised for

- **Tuning velocity.** A senior analyst can click `Override` on a known-good customer in 1 click — no hop, no modal.
- **Reason legibility.** Each decline reason is its own card with a banker-readable label and a one-line explanation.
- **Audit-as-SOP discipline.** Every clicked action is captured in a local log; in production these become structured audit rows.
- **Reuse.** Five shared primitives carry chrome; the use-case layer only ships the four UC primitives.

## Sacrifices

- **Density.** Each row is taller than a tombstone list. The bulk surface trades vertical density for inline tunability.
- **Real-time motion.** This is the *tuning* surface, not the streaming meter. A separate `Realtime` console would carry the per-second decision throughput animation; option C deliberately stays at `motion_budget = minimal`.
- **Multi-row bulk select.** "Allowlist this merchant across N declines" would be an option-D wildcard; option C is single-action-per-section by construction.
- **The case page is wide.** `lg:grid-cols-[1fr_22rem]`. On a 13" screen the right rail stacks below the main column — acceptable for a tuning surface where one-handed reasoning beats grid scanning.

## Why not the other affordance patterns

| Pattern | Why rejected for this use case |
| --- | --- |
| **Toolbar** | Toolbar at top means the analyst must select a row, then click an action. Two-step. |
| **Drawer / side panel** | Hop to a panel breaks the read flow — analyst loses position in the feed. |
| **Modal** | Worst of all worlds for a streaming surface: blocks the rest of the feed, forces a modal dismiss. |
| **Bulk-only** | Bulk select forces the analyst to leave the per-reason reasoning behind — they end up tuning blind. |
| **Gesture (swipe / kbd)** | Discoverability problem for an enterprise persona; needs onboarding the bank won't pay for. |

`inline-per-section` is the only pattern that puts the action where the
reason is, every time, with one click.
