# Option A — sparse-executive SAR investigations console

## Who is on the other side of this screen

A BSA Officer with thirty unread alerts on her queue at 9am. By 9:45 she
will have read at least ten. She does not need every signal that the
upstream agents produced — she needs the recommendation, the deadline,
and one sentence that tells her why. If she trusts the recommendation,
she clicks through to the approval gate, dispositions, and moves on.
If she doesn't, she expands. The case page is for the trust path; the
approval page is for the doubt path.

## What the page is

The case page answers three questions, in this order:

1. **What is the agent recommending?** A display-scale FILE SAR / DISMISS /
   ESCALATE badge — tone-coded (danger / neutral / warning) — with one
   serif headline that names the alert reason.
2. **How much time is left?** The shared `RegulatoryClock` primitive
   wired to the 30-day FinCEN SAR window — banded green / amber / red.
3. **What is the one reason?** Pulled deterministically from the latest
   agent reasoning in the pipeline event log. The agent that produced
   it is named (`regulatory-narrator`, `complaint-categorizer`, …).

Everything else compresses to a 22rem right rail: HITL gate state, rule
verdict badges, a deduplicated activity feed (one line per distinct
agent / service that has run), and the canvas SHA pin.

The approval page reuses the same skeleton — compact hero + clock side-
by-side, the `ApprovalGate` primitive, and an evidence-chain block that
lists the named sources without reproducing their reasoning.

## Variation axis

**Density: sparse (score 1).** No table of events, no parallel reasoning
panel, no peer-and-industry-context section, no exposure chart, no draft-
narrative preview. The information density on the main column is
deliberately at the floor — and the page leans on the size of the
decision and the size of the clock to do the visual work.

## What this design optimises for

- **Time to disposition** for the high-confidence majority of cases.
  One scroll, one click, done.
- **Regulatory clock visibility.** The 30-day SAR deadline is the single
  most expensive thing to miss; it appears on both pages and lives in
  the page-grid, not in a sidebar.
- **Banker vocabulary.** "File SAR" / "Dismiss" / "Escalate" — never
  "approve" / "reject". "BSA Officer signoff" — never "final_approval".

## What this design deliberately omits

- A multi-agent reasoning timeline (handled in other options).
- A 2D evidence grid (handled in other options).
- Inline narrative editing (handled by a later flow once the officer
  has chosen to file).
- The full pipeline event log (named-actor activity is enough at the
  triage step).

## Reuse posture

Six shared primitives are used directly: `AppShell`, `BreadcrumbNav`,
`RegulatoryClock`, `ApprovalGate`, `StatusBadge`, `StepProgress`. The
option-specific code (`DecisionHero`, `RightRail`, `ApprovalGateClient`)
is composition, not duplication — the shared primitives are the centre
of every visible region.
