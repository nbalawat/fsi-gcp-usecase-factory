# Option A — Sparse executive · dense ledger

## Persona

The CFO (with the CRO at her shoulder) on day 23 of the OCC 30-day
ALLL clock. She has fifteen minutes between the audit-committee
pre-read and the next meeting. She wants to know one thing: *is this
quarter's allowance ready to sign?*

She does **not** want a transcript of how the model got there. She does
not want a per-segment scatterplot. She wants the number, the QoQ
delta, the exception count, and the clock — and, if any of those four
look off, the ability to drill into the dense ledger that backs them
up.

## The design move

The four stages of a quarterly CECL run live on **one horizontal rail
at the top of the page**:

```
Segment classification → PD/LGD projection → Exception review → CFO attestation
```

The rail is the navigation. Clicking a stage reveals a **dense numeric
ledger** (segments × forecast quarters × bps) below it — every pixel
in that ledger earns its place. The sparse hero above never moves; the
clock keeps ticking; the rail keeps showing which stage is which.

This is the **density-axis answer** to the seed: sparse where the
executive looks first, dense where the analyst proves the number.

## What the four stages do

| # | Stage | Owner | What unfolds when clicked |
|---|---|---|---|
| 1 | Segment classification | Risk Analytics | 12-row table: segment / NAICS / geo / EAD / risk band |
| 2 | PD/LGD projection | Quantitative Models | 12 × 8 grid: LGD, EAD, PD over four forecast quarters, ECL bps, ECL $M |
| 3 | Exception review | Credit Risk Officer | Only the exception rows: reason + recommended overlay |
| 4 | CFO attestation | Chief Financial Officer | Totals table — sum of ECL by segment, with footer total |

The HITL gates (`draft_review`, `final_approval`) align to stages 3
and 4. The CFO never leaves the run-detail page to find them — they're
on the right rail with deep links to the approval surface.

## Reuse — nine shared primitives carry the foundation

`AppShell`, `WorkflowStageRail`, `RegulatoryClock`, `BreadcrumbNav`,
`MetricStrip`, `StatCard`, `StatusBadge`, `StepProgress`, and
`ApprovalGate` — every one of them used as-is. The seven net-new
components are use-case-specific orchestration (the four-stage rail
adapter, the four-table ledger, the drill controller, the executive
hero, the attestation client wrapper, and the home-page hint). No
primitive was reinvented.

## Where Server / Client live

- Every page (`/`, `/case/[id]`, `/approval/[id]`) is a Server
  Component.
- `RunStageRail`, `StageDrill`, and `AttestRespondClient` are Client
  Components — they own the drill-in state and the attestation
  disposition handlers.
- No inline functions are passed from a Server page to a Client child;
  the rail uses `next/navigation` to route, the drill owns its own
  `useState`, and the attestation handlers are colocated with the
  client wrapper.

## Why sparse for an executive

The "executive finalizes a CECL run" job is the opposite of the
analyst's "explore the data" job. Bandwidth at executive level is
seconds, not minutes. A page that shows *every* number ends up showing
*none* — the eye has nowhere to land. So we land on the allowance and
the clock; everything else is one click away, deterministic, dense.
