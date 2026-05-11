# Option A — rationale (density axis)

## The seed
> "The queue IS the page. RMs need to disposition 50-200 recommendations/day. Sparse layout: a dense table of recommendations (customer | recommended action | one-line rationale | confidence | expires | disposition buttons). Each row is a complete unit; no click-through needed for triage. Detail view is for when RM wants to drill in."

## The decision

Every UX choice in this option is downstream of one assertion: **the RM
is a triage operator, not a researcher**. The default mode is "I have
50-200 of these to get through today; let me see them all, let me act
on most of them without leaving the row, and let me drill into only
the few that puzzle me".

That makes the queue the page. Six columns on every row:

1. **Customer** — rendered by the shared `CaseCard` primitive (compact
   view) so we get the borrower identity, risk band, confidence in one
   atomic tile and reuse pays off.
2. **Recommended action + rationale** — a banker-readable label
   (`"Offer small-business credit card"`, never the internal id) and a
   one-line "why now" rationale that fits on a single line.
3. **Confidence** — `uplift_score` from the canvas, formatted as a
   percentage.
4. **Annualised uplift** — translates the score to a dollar that the
   RM cares about.
5. **Expires** — colour-coded by urgency (`<12h critical`, `<48h soon`,
   else neutral). The RM can scrub by urgency via the filter bar.
6. **Disposition** — `StatusBadge` for the current state plus the
   inline buttons. Three buttons (`Accept / Snooze / Dismiss`) cover
   the triage triad; all are reversible. The "Send to customer" action
   only surfaces AFTER accept — and it routes through the
   ApprovalGate, never fires from the row.

## Why dense

The seed says "sparse layout" but then defines a dense table. We
honour both: each row is **information-dense** (six columns of
canvas-pinned data) but the **chrome is sparse** — no shadows, no
gradients, no chart noise. Rows are 64px tall (CaseCard sets the
floor); whitespace lives at the row boundary, not inside.

## Why three pages, not one

- **/page.tsx** is the queue — the home for the RM.
- **/case/[id]** is the drill-in — full rationale, fit/uplift/regulatory
  triad, and the agent reasoning trail. It exists for the
  "I need to read this carefully before I act" moment.
- **/approval/[id]** is the irrevocable confirm — wraps the shared
  `ApprovalGate` primitive. This is the ONLY irrevocable surface in
  the option; everything else is reversible.

## Reuse stance

Seven shared primitives carry the chrome:

| Primitive       | Used for                                                  |
|-----------------|-----------------------------------------------------------|
| `AppShell`      | Header + nav rail on every page                           |
| `BreadcrumbNav` | Path on every page                                        |
| `MetricStrip`   | Five-KPI strip on queue + detail                          |
| `StatCard`      | Right rail "Throughput target / Accept rate / Canvas SHA" |
| `StatusBadge`   | Disposition state + regulatory chip + irrevocable flag    |
| `CaseCard`      | Borrower identity tile on every row + detail              |
| `ApprovalGate`  | Irrevocable "send to customer" confirm step               |

Six net-new use-case components carry the row composition + page
choreography:

- `QueueTable` — the dense grid + column header + filter bar wiring
- `QueueFilterBar` — disposition + urgency tabs
- `RecRow` — composes CaseCard + columns + inline disposition
- `DispositionButtons` — the three reversible buttons + Send link
- `RecDetail` — full drill-in: action header + metric tiles + agent trail
- `SendApprovalClient` — wraps ApprovalGate + post-confirm state UX

## What this option deliberately doesn't do

- No pipeline-stage spatial metaphor (left-to-right rail). The queue is
  flat; "stage" is one chip.
- No live SSE motion. Triage operators want stability; the table doesn't
  reorder under their cursor.
- No per-row charts or sparklines. Detail page material.
- No customer photo / branding tiles. The borrower name is enough; we
  trust the RM to recognise their book.
