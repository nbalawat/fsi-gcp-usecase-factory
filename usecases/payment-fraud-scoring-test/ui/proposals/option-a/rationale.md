# Option A · sparse-density throughput dashboard

**Persona:** Fraud Ops Lead watching ~200 tx/sec
**Variation axis:** density (`density_score: 1`)
**Console pattern:** real-time

## The seed

> Design for an Ops Lead watching transactions tick past at 200/sec.
> The decision is already made; the screen is a flood of approve / decline
> / step-up decisions plus the 3 critical KPIs (rolling decline rate, p99
> latency, model drift gauge). Each row is one line. Chrome is invisible.

## What "density 1" means here

Every surface is built around a single hard constraint: **one line per
transaction, every line identical-looking**. Vertical scanning is the
primary affordance. The Lead's eye is moving at ~3 rows/second; anything
that breaks the rhythm — a wider row, a different font, a card with
shadow, a per-row icon column — costs them comprehension.

Concretely:

| Element                         | Decision                                              |
|---------------------------------|-------------------------------------------------------|
| Row height                      | `h-7` (28px). Anything taller cuts visible rows by 30%.|
| Typography                      | `font-mono` + `tabular-nums` on every row             |
| Borders                         | One hairline `border-b border-rule` per row, no more  |
| Click target                    | Whole row, `<Link>` (ui-standards Rule 4.5)           |
| Motion                          | `tick-in` highlight on the 4 most-recent rows only    |
| Column widths                   | Fixed via inline `gridTemplateColumns` (not arbitrary Tailwind) |

## How the three routes compose

```
/                  → live floor       (the ticker — the page IS the stream)
/case/[id]         → transaction      (one tx, its score factors, agent reasoning)
/approval/[id]     → step-up queue    (audit how customers responded to challenges)
```

**No HITL gates anywhere.** Per agentic-ui-principles' "human in the loop"
principle, real-time UCs handle HITL via a *scoring rules monitor or
step-up disposition surface*. Option A chooses the latter: the
`/approval/[id]` route is explicitly labelled "step-up queue — advisory,
no HITL gate" so the reviewer is never confused into thinking this is
where they approve a transaction.

## Why 3 KPIs, not 5

The seed says "the 3 critical KPIs". MetricStrip's 5-column band would
have dragged the band height up and added two numbers the Lead doesn't
watch (total volume, average score — both are already implicit in the
stream below). The home page uses a **custom 3-up `KpiHeader`** that
re-uses the shared `StatCard` primitive, keeping reuse high while
respecting the seed.

The /case and /approval routes do use the full 5-column `MetricStrip`
because the per-transaction / per-queue context wants those five numbers
visible at once.

## Reuse footprint

- 5 shared primitives: `AppShell`, `BreadcrumbNav`, `MetricStrip`,
  `StatCard`, `StatusBadge`
- 5 net-new UC components: `KpiHeader`, `DecisionStream`, `DecisionRow`,
  `ScoreFactorBars`, `StepUpQueueRow`

Real-time consoles intentionally have fewer canonical primitives than
pipeline / investigations consoles — there is no workflow stage rail, no
regulatory clock, no approval gate. The net-new count (5) is concentrated
in the throughput surfaces, which is exactly what the seed asks for.

## What this option is NOT

- Not a "deep-dive" console. The /case route is intentionally one screen
  of factor bars + a one-line agent summary. If the Lead needs to go
  deeper, that's a separate (out-of-scope) audit console.
- Not animated. The tick-in highlight is the only motion. There is no
  marquee scroll, no auto-jump-to-top, no flashing on alert.
- Not aspirational about HITL. Where another option might invent a
  "policy override" surface to give the human more agency, Option A
  treats the 0-HITL constraint as load-bearing: the only human touch
  point is auditing how customers responded to challenges.

## Files

```
option-a/
├── Dockerfile                # standalone Cloud Run image
├── package.json              # next 14.2.15, react 18, no extras
├── manifest.yaml             # design proposal manifest
├── tailwind.config.ts        # inlined Atrium tokens + token aliases
├── next.config.mjs           # output: standalone
├── tsconfig.json             # path aliases → vendored @fsi-bank/*
├── postcss.config.mjs
├── app/
│   ├── layout.tsx            # root html · body · globals.css
│   ├── globals.css           # Atrium variables + tick-in keyframe
│   ├── page.tsx              # the live floor
│   ├── case/[id]/page.tsx    # transaction detail
│   └── approval/[id]/page.tsx# step-up queue
├── components/
│   ├── KpiHeader.tsx         # 3 sparse KPI tiles (StatCard wrapper)
│   ├── DecisionStream.tsx    # the throughput list w/ verb filter
│   ├── DecisionRow.tsx       # one-line tx row (whole-row Link)
│   ├── ScoreFactorBars.tsx   # diverging-bar score breakdown
│   └── StepUpQueueRow.tsx    # one-line challenge row
└── lib/
    └── data.ts               # read-only re-exports + pure adapters
```
