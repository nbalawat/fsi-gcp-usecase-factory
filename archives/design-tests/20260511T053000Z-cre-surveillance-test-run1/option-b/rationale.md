# Option B — rationale

CRE risk is a **geographic** phenomenon. A weakening submarket in Phoenix, a
softening office cluster in Boston, a regional concentration of warehouse
exposure — these are the patterns a Chief Credit Officer looks for at the
top of the morning, and they are intrinsically spatial. Option B treats
that spatial reality as the **page spine**: the home surface IS the map,
a 2×2 census-region tile grid colored by aggregate watchlist density.
Drilling into a facility doesn't hand the user off to a generic case
view — it preserves the locator band so the user always sees *where on
the map* they are and what other facilities live in the same state
cluster.

The metaphor extends to the HITL surface. Booking a specific reserve is
irrevocable and high-stakes; the reviewer's spatial context — "this
facility, in this state cluster, in a region that just turned warning-amber"
— is the load-bearing evidence. So the approval flow opens with the same
FacilityLocator band, then shows the shared `<ApprovalGate>` inline with
a pre-filled reserve amount the reviewer can override before confirming.
The reviewer never has to leave the geography to dispose of the gate, and
they never lose the spatial anchor that justifies the decision.
