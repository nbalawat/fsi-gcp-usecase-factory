---
name: console-run
description: Knowledge for building the run console pattern. Auto-invoked when working on UI for periodic exercises (CECL, regulatory reporting, model risk validation, ATM forecasting, RCSA). Shows progress through a quarterly/annual run with segments completing, qualitative factors authoring, and board-ready outputs.
---

# Run console

The run console serves periodic exercises where the unit of work is the run itself. The audience is the team lead orchestrating the exercise toward a deadline.

## When this console fits

- Time horizon: days to weeks per cycle (quarterly, monthly, annually)
- Unit of work: the run; sub-units are segments / work items
- Audience: allowance team lead (CECL), regulatory reporting lead, model risk lead
- Headline metric: progress vs. filing deadline

Use cases that fit: #13 model risk, #20 reg reporting, #22 CECL, #24 ATM forecasting, #18 RCSA.

## Layout

Five visual zones:

1. **Header** — exercise name, period (Q1 2026), persona, "run in progress · day N of M" indicator
2. **Metric strip** — portfolio covered, headline output (e.g., provision projected), segments done, qualitative factors done, deadline countdown
3. **Segments list** — work units in three states: complete (with results), in-flight (with progress bars and rotating status), pending
4. **Right rail** — qualitative factors queue, variance to prior period, board-ready outputs status
5. **Footer** — actions: all segments, methodology library, compare to prior, stress overlay, audit trail

## Segment row anatomy (in-flight)

```
[blue indicator] Segment name              running...
                $X.XB · N units             vintage analysis · K/M
[progress bar 81%]                          ~14m left
                                            12 mo R&S
```

Three states encoded by left-border color:
- Green: complete (shows result, +/- vs prior, completed by)
- Blue: in-flight (shows current sub-task, progress bar, ETA)
- Gray: pending (shows queued status, expected start)

## Components used

From the shared library:
- Header strip
- Metric strip with deadline countdown
- Segment row component (compact, with state-aware styling)
- Progress bar with rotating status messages
- Right-rail summary panel
- Variance comparison block
- Footer action bar

## Configuration

```json
{
  "console": "run",
  "use_case": "cecl_quarterly",
  "persona": "Allowance team lead",
  "run_metadata": {
    "type": "quarterly",
    "current_period": "Q1 2026",
    "deadline": "May 9 2026",
    "deadline_label": "10-Q filing"
  },
  "metrics": [
    {"id": "portfolio_covered", "label": "Portfolio covered", "unit": "$"},
    {"id": "headline_output", "label": "Provision projected", "unit": "$",
     "compare_to": "prior_period"},
    {"id": "segments_done", "label": "Segments done", "format": "{n} of {total}"},
    {"id": "qfs_done", "label": "Qualitative factors", "format": "{n} of {total}"},
    {"id": "deadline_countdown", "label": "Filing deadline", "alert_at_d": 7}
  ],
  "segments": [
    {"id": "ci_large", "label": "C&I · large corporate",
     "portfolio": "$3.2B", "units": 1847,
     "rs_period": "12 mo R&S"},
    {"id": "cre_office", "label": "CRE · office",
     "portfolio": "$1.8B", "units": 287,
     "rs_period": "18 mo R&S",
     "watch": true},
    {"id": "residential_jumbo", "label": "Residential mortgage · jumbo",
     "portfolio": "$4.1B", "units": 8420,
     "rs_period": "12 mo R&S"}
    /* ... */
  ],
  "qualitative_factors": [
    {"id": "macro_gdp", "label": "Macro forecast · GDP"},
    {"id": "unemployment", "label": "Unemployment · regional"},
    {"id": "office_deterioration", "label": "Office sector deterioration"},
    {"id": "card_delinquency", "label": "Card delinquency uptick"},
    {"id": "concentration_auto", "label": "Concentration · auto OEM"}
    /* ... */
  ],
  "outputs": [
    {"id": "allowance_memo", "label": "Allowance memo"},
    {"id": "10q_schedule", "label": "10-Q schedule"},
    {"id": "ffiec_call_report", "label": "FFIEC Call Report"},
    {"id": "committee_deck", "label": "Committee deck"}
  ],
  "variance": {
    "compare_to_period": "Q4 2025",
    "components": ["quantitative", "qualitative"]
  }
}
```

## Variance to prior period (right rail)

The single most important number for the audit committee:

```
VARIANCE TO Q4
Q4 2025 allowance         $242M
Quantitative Δ            +$28M
Qualitative Δ             +$14M
─────────────────────────────────
Q1 2026 projected         $284M
```

Deltas color-coded amber when increasing, green when decreasing.

## Qualitative factors queue (right rail)

Each QF has a state:
- approved (green left-border)
- awaiting committee (amber left-border)
- drafting (purple, pulsing)
- pending (gray, low opacity)

Drafting QFs show what the agent is currently doing:
```
Concentration · auto OEM     drafting
analyzing dealer floorplan exposure...
```

## Hard rules

- Deadline countdown must be visible at all times (header)
- Variance to prior is the headline number
- Segment status must encode three states distinctly
- Qualitative factors are HUMAN-approved; agent drafts only
- Audit trail link is permanent (regulatory examiners click it)

## Anti-patterns to refuse

- Hiding the deadline (it's the entire point)
- Auto-approving qualitative factors (compliance violation)
- More than 20 segments without grouping (overwhelming)
- Showing "in flight" without progress (causes anxiety)
- Skipping variance (audit committee will ask)
