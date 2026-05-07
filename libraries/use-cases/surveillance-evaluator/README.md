# Use-case archetype: surveillance-evaluator

Whole-use-case template for portfolio surveillance — continuous re-evaluation of positions / properties / vendors with agent flagging.

## Shape

```
schedule-tick → [handler] (gather positions to re-eval)
                ↓
            [fan-out atomic services] (per-position metrics)
                ↓
            [rules-service] (threshold flags)
                ↓
            [risk-rater] (interpretation, severity, "why")
                ↓
            [state-grid-sink] (update positions; history retained)
                ↓
        flagged? ──→ trigger investigation pipeline
```

## Picks the surveillance-console

Console shows a 2D heatmap (e.g. property × metric). Color encodes flag severity. Click into a flag → investigation pane.

## Why no approval gate

Surveillance doesn't approve individual positions — it FLAGS them. Approval (if any) happens in the downstream investigation pipeline.

## Drift alarms

A separate cross-cutting process aggregates flag rates across the portfolio. Sudden surges in flagged positions = systemic issue (interest-rate shock, sector contagion). The risk officer is paged.

## Fits

- CRE portfolio monitoring (LTV drift, occupancy trends)
- Third-party vendor risk management (control attestation drift)
- Operational reconciliation (intra-day mismatch detection)
- Deposit pricing surveillance (rate attractiveness drift)
