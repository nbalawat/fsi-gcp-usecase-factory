---
name: console-pipeline
description: Knowledge for building the pipeline console pattern. Auto-invoked when working on UI for use cases with multi-day flow through stages (commercial loan, mortgage, KYC, treasury onboarding, collections). The pipeline console shows cases moving horizontally through stages with human checkpoints, stuck-case detection, and per-stage metrics.
---

# Pipeline console

The pipeline console serves use cases where work flows through multiple stages over days or weeks, with human checkpoints at specific points.

## When this console fits

- Cycle time: days to weeks
- Unit of work: an application or case in motion
- Multiple humans touch the case (originator, underwriter, processor, closer)
- Audience: operations lead — mortgage ops, loan ops, KYC ops, treasury ops

Use cases that fit: #1 commercial loan, #3 KYC/account opening, #5 mortgage origination, #8 treasury onboarding, #15 collections.

## Layout

Six visual zones:

1. **Header** — use case name, persona, "in flight" count, breadcrumb back to live floor
2. **Metric strip** — apps today, cycle time, agent extraction accuracy, agency mix, stuck count
3. **Pipeline canvas** — horizontal stages, agent-driven vs human-checkpoint visually distinct, case cards within each stage
4. **Currently moving** — feed of cases transitioning between stages
5. **Stuck cases** — cases too long in their current stage with the specific reason
6. **Footer** — actions: all cases, agency mix, underwriter workload, bottleneck analysis

## Stages (configurable per use case)

Standard mortgage shape (6 stages):
1. Intake (agent) — 2 hours
2. Doc IQ (agent) — 4-8 hours
3. Underwrite (human) — 1-3 days
4. Conditions (mixed) — 2-5 days
5. Clear-to-close (human) — 1 day
6. Booking (auto) — 1 hour

Standard commercial loan shape (5 stages):
1. Intake (agent) — 2 hours
2. Doc IQ (agent) — 4-8 hours
3. Underwrite (human) — 1-3 days
4. Credit committee (human) — 1-7 days (if amount > threshold)
5. Booking (auto) — 1 hour

Each use case configures its stages in `ui/use_cases/{uc}/config.json`.

## Components used

From the shared library:
- Header strip
- Metric strip
- Pipeline stage column (one per stage)
- Case card (compact for stages, detail on click)
- Live activity ticker (for "currently moving")
- Stuck/exception panel
- Footer action bar

## Configuration shape

```json
{
  "console": "pipeline",
  "use_case": "mortgage_origination",
  "persona": "Mortgage ops lead",
  "stages": [
    {"id": "intake", "name": "Intake", "type": "agent", "duration_target_h": 2},
    {"id": "doc_iq", "name": "Doc IQ", "type": "agent", "duration_target_h": 8},
    {"id": "underwrite", "name": "Underwrite", "type": "human", "duration_target_h": 48},
    {"id": "conditions", "name": "Conditions", "type": "mixed", "duration_target_h": 96},
    {"id": "ctc", "name": "Clear-to-close", "type": "human", "duration_target_h": 24},
    {"id": "booking", "name": "Booking", "type": "auto", "duration_target_h": 1}
  ],
  "metrics": [
    {"id": "apps_today", "label": "Apps today"},
    {"id": "cycle_time", "label": "Cycle time", "unit": "days"},
    {"id": "extraction_accuracy", "label": "Agent extraction", "unit": "%"},
    {"id": "agency_eligible", "label": "Agency eligible", "unit": "%"},
    {"id": "stuck_count", "label": "Stuck > SLA", "alert_threshold": 5}
  ],
  "stuck_detection": {
    "method": "duration_exceeds_target",
    "alert_after_pct": 150
  }
}
```

## Data sources

The console reads from:
- Cloud Workflows execution state (which stage each case is in)
- BigQuery `audit.workflow_executions` (durations, history)
- BigQuery `audit.human_actions` (human checkpoint dispositions)
- Pub/Sub topic for live activity feed (case transitions)

Don't query individual atomic services from the console. Use the BFF (backend for frontend) layer.

## Hard rules

- One frontend codebase across all use cases. The console renders from config; don't fork the React.
- Stuck-case detection must be present; it's the headline feature for ops leads.
- "Currently moving" feed must update via WebSocket or SSE, not polling.
- Click into a case → opens the case-detail surface (separate component, also reused).
- Mobile: degrade to read-only stage summary; no editing on small screens.

## Anti-patterns to refuse

- Custom React components per use case (use the configurable pipeline component)
- Polling for case state (use push)
- Showing all stages with equal visual weight (the active stage and stuck cases need to dominate)
- Hiding the agent's extraction accuracy or other "is the agent working?" metrics
- More than 8 stages (decompose the use case)
