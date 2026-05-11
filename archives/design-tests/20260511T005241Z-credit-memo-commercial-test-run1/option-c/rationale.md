# Option C — inline-per-section

## Why inline-per-section beats sticky-bottom

A credit memo is not one decision; it is nine. The analyst is judging
extraction faithfulness, the spread, peer context, collateral, related-
party exposure, the rating, policy rules, the narrative, and finally
sign-off. A sticky-bottom approval bar conflates all nine into one
moment of action, which forces the user to either (a) hold every
question in their head until the bottom of a long memo, or (b) scroll
back up to remember what they thought about a specific section. Both
are bad for accuracy and bad for auditability.

Inline-per-section moves the affordance to the data. Each section ends
with its own `approve / edit / request-revision / reject` row. The
user reads the spread, decides, and moves on. The audit trail captures
nine independent judgments instead of one aggregated "approve" that
hides which sections the analyst actually agreed with. When something
needs to change — say the rating section's `borrower-network` row is on
watch — the analyst writes an inline edit at the rating section, not
a paragraph in a global "comments" box. This is the strongest
interpretation of agentic-ui principle 5 ("human in the loop"): the
human acts where the agent acted.

The approval-flow route does NOT abandon the philosophy. Instead it
summarises the inline decisions already made, flags the gates that
still need action, and jumps the credit officer back to the exact
section needing attention. The only "fast-track" affordance is a
button that approves *only the still-pending sections*; edits and
rejects are preserved verbatim. The canonical `ApprovalGate` from the
shared components powers the final sign-off; it has been reused
without modification.

## Notes on typecheck

Two minor liberties:

1. The `Stage` shape in `WorkflowStageRail` requires `type` and
   `count` instead of the more conventional `label / status`. We
   pin the type via a small helper and pass `count: 1` for every
   stage — this is a single-case detail page, so the count is
   trivially 1.
2. `Borrower` / `CaseShape` types are re-exported from `_shared/mock-
   data.ts` rather than re-declared, to preserve "single source of
   truth" for the canvas data.
