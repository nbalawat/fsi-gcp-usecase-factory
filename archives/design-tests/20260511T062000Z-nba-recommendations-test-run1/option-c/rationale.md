# Option C — affordance variation: inline disposition

## The position

Disposition lives where the rationale is. Every recommendation card
carries four inline buttons — **Accept** (reversible; queues for
"send"), **Reject** (with required short reason), **Snooze** (24h / 7d
/ 30d), **Escalate**. **No modals. No bottom-bar.** The "send to
customer" action is the ONLY step that walks to `/approval` — and the
ONLY irrevocable commit in the entire surface. Otherwise the queue is
the action surface.

## Why this is the right affordance for a branch banker

A relationship manager processing the morning NBA queue is throughput-
dominant. The work pattern is:

1. Read the rationale on the card.
2. Decide: accept / reject / snooze / escalate.
3. Move to the next card.

Anything that breaks step 2 into a separate "open modal → choose →
confirm" sub-flow costs real wall-clock per recommendation. A
floating bottom-bar likewise loses the spatial pairing between the
*specific rationale* and the *specific button* the banker just
pressed — the audit trail becomes "RM clicked Accept", not "RM
accepted *this rationale*".

Option C bets that:

- **Reversible actions should be one click**, anchored to the card.
- **Irrevocable actions must walk to a dedicated surface** — and
  there is exactly one of them in this use case.
- **Reject must capture a short reason** — analytics tracks override
  rate, so the reason is mandatory. We do that inline.
- **Snooze should not be a modal** — picking 24h vs 7d vs 30d is a
  cheap three-button choice; expanding inline is faster than a
  popover.
- **Escalate is one-click** because the destination (market manager
  queue) is the same for every escalation — no extra metadata
  needed.

## How the rules show up

- **Canvas-pinned** — every row derives from `BORROWERS` in
  `_shared/mock-data.ts`; the canvas SHA-256 (`0922c405…`) is
  rendered in the page header.
- **Six shared primitives, all `source: shared`** — AppShell,
  BreadcrumbNav, MetricStrip, StatCard, StatusBadge, ApprovalGate.
  Materially inlined under `./primitives/` — no `_vendor`
  symlinks, no workspace-package resolution.
- **ApprovalGate is reused for /approval** — the bank's existing
  HITL primitive carries the irrevocable confirmation dialog +
  "GL impact / customer-visible" warning copy.
- **All Tailwind tokens** — paper / ink / rule / accent / semantic
  / riskBand. No arbitrary values.
- **Rule 38 self-contained** — own `package.json`,
  `next.config.mjs`, `Dockerfile`, `tailwind.config.ts`,
  `tsconfig.json`, `postcss.config.mjs`. Builds standalone.

## Routes

| Path             | What it shows                                          |
| ---------------- | ------------------------------------------------------ |
| `/`              | Queue with inline disposition on every card            |
| `/case/[id]`     | Recommendation detail + same inline disposition + timeline |
| `/approval/[id]` | The one irrevocable walk — send to customer            |

## What option C is NOT for

- A wealth-rebalancing recommendations queue with deep rationale
  trees and full DCF cards — the inline-card form runs out of room.
- A compliance-heavy surface where every disposition needs a
  multi-field justification — use a recommendations console with a
  side-drawer instead.
- A first-line monitoring queue where the human is comparing across
  many recommendations — the inline form privileges per-card
  reading, not lateral scanning.
