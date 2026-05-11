# Option C — tradeoffs

## Optimised for

- **Act on what you see.** Decisions live next to the data that
  informs them. No mental hop between reading the spread and approving
  it.
- **Section-grained audit trail.** Nine independent decisions per
  case, each with optional comment. Edits and revision requests are
  captured at the section level — regulators can see exactly which
  part of the memo the analyst questioned.
- **Fast-track when clean.** If every inline decision is "approve",
  the credit officer signs off in one click on the approval page.
- **No context switch.** The approval page links back to the exact
  section needing action; it never replaces inline review.

## Sacrifices

- **No bulk approve on the memo page.** Forcing per-section action is
  deliberate; the bulk button only lives on the approval page and
  only acts on still-pending sections.
- **Longer scroll.** Nine sections expanded means more vertical
  travel than a tabbed or drawer design. We mitigate with a sticky
  in-page rail (SectionJumpRail) that doubles as a per-gate progress
  view.
- **Per-section state to persist.** A real implementation must save
  each inline decision as it happens — partial sessions, browser
  refresh, hand-off to a different reviewer. This design pushes more
  state into the audit-writer than a single-decision page would.
- **Less ceremony at sign-off.** The credit officer's final approval
  is small and fast by design; teams that want a "confirmed reading
  pause" should add a confirmation modal to ApprovalGate (already
  supported for irrevocable actions).
