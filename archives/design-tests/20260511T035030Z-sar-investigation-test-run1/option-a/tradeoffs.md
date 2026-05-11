# Option A — tradeoffs

## What we gave up by going sparse

### 1. Investigation depth on the surface
A SAR investigation is, by regulation, an investigation — not a triage.
Compressing the supporting evidence to a 22rem rail means a less-
experienced analyst could disposition a case without ever looking at
the borrower network, the structuring window, or the peer-and-industry
context. The bet is that the BSA Officer who scans 30 cases a day has
internalised the standard pattern and only needs the agents' work when
something looks off — and that when something looks off, the click into
the approval gate's evidence chain is acceptable friction.

### 2. Visible agent diversity
Four agents run on this case (complaint-categorizer, insider-screener,
regulatory-narrator, narrative-drafter). The sparse-executive page only
surfaces ONE of them — the latest in the chain — as the one reason.
The right-rail activity feed names the others, but it does not show
their reasoning. Options that lead with an agent timeline or a
side-by-side reasoning panel will win on agent transparency. We bet
that transparency belongs on the approval page, not the queue-scan page.

### 3. Two-click disposition for the doubt path
A confident officer dispositions in one click (`Open approval gate →`
then `Approve`). A doubting officer is two clicks from the evidence
because she must open the approval gate first to scan the evidence
chain. A unified single-page design could collapse this — at the cost
of doubling the case page's height.

### 4. Right-rail under-use
When the centre column carries the decision, the clock, and the reason
in display-scale type, the eye does not naturally travel to a 22rem
rail. Some BSA Officers may simply never look at the rule verdicts.
This is partly mitigated by the badge prominence (`StatusBadge` with a
coloured dot) but it is a real risk.

## What we are deliberately accepting

- **Computed deadline.** The 30-day SAR deadline is derived from the
  first event's timestamp. When the canvas adds a re-open event kind
  or a "case suspended" pause, this derivation must change. The
  business rule for "when did the 30 days start" should not live in
  this UI — when the canvas grows that field, we swap to using it.

- **Decision vocabulary mapping.** The shared mock data ships `approve`
  as the demo final decision; this option maps it to `file_sar` at the
  data-adapter boundary. That is a one-line adapter, but it is a place
  where designer-side vocabulary can drift from upstream data shape.

- **No live event stream.** The SSE backbone is not wired into this
  proposal. For the BSA Officer's queue-scan pattern, the page is
  acceptable as a snapshot. If the pattern is "watch this case as the
  agents run", a live update on the activity rail is the right
  follow-up.
