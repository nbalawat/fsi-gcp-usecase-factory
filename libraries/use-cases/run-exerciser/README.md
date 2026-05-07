# Use-case archetype: run-exerciser

Whole-use-case template for periodic exercises with deadlines. CECL provisioning runs, regulatory reporting cycles, model validation cycles, ATM forecasting.

## Shape

```
schedule-tick → [handler] (initiates run, allocates segments)
                ↓
            [fan-out segment computations]
                ↓
            [rules-service] (regulatory threshold checks per segment)
                ↓
            [regulatory-narrator] (qualitative factors, executive summary)
                ↓
            [approval-gate] (model owner; CFO; CCO depending on run type)
                ↓
            [regulatory-filing-sink + board-output-sink]
```

## Picks the run-console

Console shows: progress through segments (Gantt-style), qualitative factor authoring panel, executive summary preview, regulatory clock. Stuck-segment detection.

## Regulatory clock (varies by run)

- CECL: quarterly close + 10-Q filing window
- 10-K: annual; SEC filing window
- FFIEC: monthly / quarterly per call report schedule
- MRM annual: per bank policy

## Vintage + lineage are mandatory

Every input data point carries a `vintage_date` and `source` so the run is auditable. A 10-K filed in March that uses Q4 data must clearly show the data vintage; auditors will challenge anything ambiguous.

## Why qualitative factors are agent-narrated

CECL provisioning has Q-factors (qualitative adjustments to the quantitative loss estimate). The narrator drafts the qualitative narrative grounded in documented bank decisions (committee minutes, policy updates) — never inventing factors.

## Fits

- CECL run (quarterly)
- Regulatory reporting cycles (10-Q, 10-K, FFIEC, FR Y-9C)
- MRM annual model validation
- ATM cash forecasting (daily/weekly)
- Quarterly RCSA cycle
