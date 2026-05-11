# Option A — rationale

The Chief Credit Officer doesn't read screens; they scan them. The
surveillance console for a CRE book has exactly one artifact the CCO
needs at glance: which facilities, on which risk dimensions, are
drifting. Option A makes that 2D grid the page. The AppShell strip
gives the CCO their bearings (use case, env, nav); a five-KPI
`MetricStrip` reduces "how big is this book and how much of it is on
fire" to one row of mono numerals; everything else — the 12-facility,
5-dimension grid — is one continuous color field. Cells are tokens-only
`bg-riskBand-…` swatches, sized so 60 of them fit on a standard
laptop screen with no scrolling. The right rail compresses to a band
legend (so the executive can decode the color field) and a canvas-SHA
pin (so audit and provenance live one glance away).

Every interactive affordance is a real navigational link. There are no
ghost buttons, no inline `onClick` decorations, no dialog boxes between
the executive and the next surface they need. The `/case/[id]`
cell-detail page repeats the same color language at a higher
resolution (one facility, five dimensions, peers in the same NAICS),
and `/approval/[id]` is where the only irrevocable action in the canvas
— `book_specific_reserve` — gets the standard `<ApprovalGate>` ceremony.
Server components carry the entire grid; the only `"use client"`
boundary is the approval wrapper, so first-paint is fast and the
30-second scan is cheap.
