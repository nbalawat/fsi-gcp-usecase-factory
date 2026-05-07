---
name: console-surveillance
description: Knowledge for building the surveillance console pattern. Auto-invoked when working on UI for portfolio monitoring use cases (CRE, reconciliation, deposit pricing, vendor TPRM). Shows a 2D heatmap of positions/properties/vendors with agent flags surfacing drift and outliers.
---

# Surveillance console

The surveillance console serves continuous portfolio monitoring. The audience finds where risk is concentrating that wasn't there last quarter.

## When this console fits

- Time horizon: continuous (re-evaluation every few hours)
- Unit of work: a position / property / vendor / account
- Audience: chief credit officer, portfolio manager, risk officer
- Failure mode: hidden deterioration

Use cases that fit: #7 CRE surveillance, #14 reconciliation, #19 deposit pricing, #23 vendor TPRM, #25 customer 360 segment view.

## Layout

Five visual zones:

1. **Header** — use case name, persona, "N new flags this week" alert
2. **Metric strip** — portfolio total, watch list, criticized, agent reviewed, new signals
3. **Heatmap canvas** — 2D grid: rows = one dimension (sector, account type), columns = another (geography, segment), cells colored by trajectory
4. **Property/position list** — for the selected cell, top items with sparklines and key metrics
5. **Right rail** — agent flags with sources, current sweep status, data feed health

## Heatmap mechanics

Each cell shows:
- Total exposure ($M)
- Count of items
- Color encoding the metric of interest (DSCR trajectory, match rate, profitability, risk score)
- Small dot indicator if cell has new agent flags this week

Color scale (default trajectory-style):
- Green (#97C459): improving
- Light green (#C0DD97): stable
- Amber (#FAC775): watching
- Light red (#F09595): declining
- Red (#E24B4A): criticized
- Dark red (#A32D2D): substandard

A toggle lets viewers switch the metric (DSCR vs LTV vs occupancy, for example).

## Components used

From the shared library:
- Header strip
- Metric strip
- 2D heatmap grid (configurable rows/columns/color scale)
- Property/position list with sparklines
- Agent reasoning panel (right rail, flag-by-flag)
- Progress bar with rotating status (sweep indicator)
- Right-rail summary panel

## Configuration

```json
{
  "console": "surveillance",
  "use_case": "cre_surveillance",
  "persona": "Chief credit officer",
  "heatmap": {
    "rows": ["Office", "Multifamily", "Industrial", "Retail", "Hospitality"],
    "columns": ["NYC", "SF Bay", "Chicago", "Atlanta", "Dallas", "Other"],
    "metrics": [
      {"id": "dscr_trajectory", "label": "DSCR trajectory", "default": true,
       "scale": "trajectory"},
      {"id": "ltv", "label": "LTV", "scale": "single_value"},
      {"id": "occupancy", "label": "Occupancy", "scale": "single_value"}
    ]
  },
  "metrics": [
    {"id": "portfolio_total", "label": "Portfolio", "unit": "$"},
    {"id": "watch_list", "label": "Watch list", "alert": true},
    {"id": "criticized", "label": "Criticized", "alert": true},
    {"id": "agent_reviewed", "label": "Agent reviewed"},
    {"id": "new_signals_7d", "label": "New signals · 7d"}
  ],
  "right_rail": {
    "panels": ["agent_flags", "sweep_status", "data_feeds"]
  },
  "sweep": {
    "interval_h": 6,
    "scope": "all_properties"
  },
  "data_feeds": [
    {"id": "rent_rolls", "label": "Rent rolls", "freshness_target_h": 24},
    {"id": "appraisals", "label": "Appraisals", "freshness_target_h": 720},
    {"id": "adverse_media", "label": "Adverse media", "freshness_target_h": 4},
    {"id": "comps", "label": "Market comps", "source": "CoStar"},
    {"id": "epa", "label": "EPA / environmental", "freshness_target_h": 168}
  ]
}
```

## Agent flags panel (right rail)

The most important element after the heatmap. Each flag:

```
[severity bar: red/amber/green]
PROPERTY NAME · timestamp
short narrative explaining what changed
conf 0.89 · 5 sources
```

Severity comes from the agent's risk score for the flag. Sources are tool calls cited (news, EPA, CoStar, etc.).

Top 3-5 flags shown; "View all flags" link for the rest.

## Sweep status

Real-time indicator of what the agent is doing now:

```
● Sweep in progress
Re-evaluating 87 office properties · DSCR projection
[progress bar: 64%]
56 of 87 reviewed
```

Status messages rotate every few seconds (not random — actual current activity).

## Data feed health

A short table:

```
Rent rolls       142 fresh
Appraisals       14 stale  ← amber
Adverse media    live · 4h
Market comps     live · CoStar
EPA              weekly
```

"Stale" data is itself a flag — the agent can't see what it can't read.

## Hard rules

- Heatmap is the focal point (60% of horizontal space)
- Toggle between metrics must preserve cell selection
- Click a cell → property list appears below; never replace the heatmap
- Agent flags must include cited sources
- Sweep status updates show real activity, not animations

## Anti-patterns to refuse

- Replacing the heatmap with a list (defeats the purpose)
- Color scales that don't map to risk semantics (e.g., rainbow scales)
- More than 6×6 cells (too granular; aggregate)
- Agent flags without source citations (must be auditable)
- Hiding stale data (the gap is itself information)
