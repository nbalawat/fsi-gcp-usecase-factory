# Option D — regulator-audit-first

CRE concentration surveillance is the most-examined corner of a bank's loan
book. Three of the other proposals optimize for the things a portfolio
manager wants to see at a glance — a density grid, a map of properties, or
inline accept/reject actions on a queue. This proposal commits hard to a
fourth, orthogonal position: **the OCC examiner's view**. Every screen IS
the supervisory exam log. Every threshold the GoRules engine evaluated is
shown with the regulatory or bank-policy citation that authorized it.
Every agent reasoning, every service call, every reviewer disposition
carries an inline `§` citation chip pointing to the statute, the
interagency guidance, the bank policy section, or the loan covenant that
made it relevant. The page can be read top-to-bottom as a chain of
custody an examiner would otherwise have to build by hand.

The two implemented routes carry this discipline through. `/case/[id]`
opens with a cover-page header that reads like the first page of an exam
report — facility ID, borrower, region, NAICS, OCC risk band, run ID —
then walks down through a metrics strip, a threshold ledger (every rule,
every authorized threshold, every observed value, every citation), and a
supervisory exam log (every event, timestamped in UTC, with its citation
chain). `/approval/[id]` scopes that same surface to one HITL gate: the
auditor's proposed disposition is framed as a "supervisory finding", the
slice of the ledger that led to it is shown alongside, and the
irrevocable `book_specific_reserve` gate carries a confirmation modal
that names the GL impact in plain English. Five shared primitives from
`@fsi-bank/components` provide the chrome (AppShell, BreadcrumbNav,
MetricStrip, StatCard, StatusBadge); six net-new components carry the
audit-first idiom (CitationChain, ThresholdLedger, AuditLedger,
ExamHeader, GateRoster, ReserveBookingClient).
