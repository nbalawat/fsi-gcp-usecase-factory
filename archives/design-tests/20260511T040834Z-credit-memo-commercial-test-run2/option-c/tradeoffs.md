# Option C — tradeoffs

## Optimised for

- **Decision lives next to the data.** Each memo section ends with the
  exact affordance it enables — approve / edit & approve / request
  revision / reject — directly under the evidence that produced the
  recommendation. No sticky bottom bar, no modal drawer, no separate
  approval page that loses context.
- **Sectioned reading discipline.** You cannot accidentally approve a
  section you have not scrolled to; the section is the unit of
  attention AND the unit of disposition. The two are deliberately
  coupled.
- **Reviewer-readable agent activity.** Every section's evidence list
  shows the agents that contributed to it (rater-with-covenant inside
  spread & rating; narrative-drafter inside draft). The reviewer sees
  WHICH model did WHAT for THIS section.
- **Cohesive case ↔ approval relationship.** The approval page is the
  same memo with the borrower-intake section hidden and the focus
  gate visually ringed. There is no second mental model — same
  `MemoSection`, same `SectionAffordanceRow`.
- **Inline comment, inline confirm.** Comment-required dispositions
  (edit / revision / reject) reveal a textarea in place; the
  irrevocable final approval surfaces a confirm strap before posting.
  Both stay anchored to the section.

## Sacrifices

- **No bulk-approve.** There is no single button that closes every
  gate at once. Every section must be disposed individually. This is
  the right ask for SR 11-7 + audit posture but slower for happy-path
  cases.
- **Long single page on case detail.** Five tall sections stack
  vertically. The right-rail `SectionNav` mitigates this, but power
  users wanting a one-screen overview will prefer the
  density-optimised option.
- **Inline comment expansion shifts the layout.** When the reviewer
  asks for a revision, the textarea pushes content below it down by
  ~100px. This is intentional — the affordance stays in place — but
  it is a layout shift.
- **Cross-stage timing is obscured.** Because evidence rows are
  partitioned by section, you cannot see a single timeline of
  agent-A-then-service-B-then-agent-C across stage boundaries the way
  a chat-style transcript would. The trade is intentional: the
  reviewer thinks in sections, not in seconds.
- **Approval flow drops borrower-intake.** The approval page only
  shows the four gated sections. The borrower-intake section has no
  gate, so it doesn't appear; if a reviewer wants to verify the
  uploaded docs, they jump to `/case/[id]` via the "Full memo" link.
- **Citation depth.** Each evidence row carries a `ref:` (agent id,
  service id, rule id). Deeper drill-in (e.g. PDF page + bbox) is
  deferred to a future detail panel — not the spine of this option.

## What this option is NOT

- Not a chat transcript (that's option D's wildcard).
- Not a 2D heatmap / surveillance grid.
- Not a "sticky approval bar at the bottom" — that's the affordance
  pattern this option explicitly rejects.
- Not a modal drawer pattern — every disposition stays inside the
  section flow.
