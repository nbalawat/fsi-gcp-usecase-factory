# Use-case archetype: investigation-initiator

Whole-use-case template for case-based investigations with regulatory deadlines. SAR, Reg E disputes, breach notifications, trade-finance LC investigations.

## Shape

```
trigger → [handler] (creates case)
            ↓
        [fan-out atomic services]    [regulatory-clock] (parallel)
            ↓
        [rules-service]
            ↓
    [triage] → [investigator] → [narrator] (multi-agent pattern)
            ↓
        [approval-gate] (BSA officer / compliance)
            ↓
        [filing-sink + customer-notification-sink]
```

## Picks the investigations-console

Console shows: case list with regulatory clocks, click into a case → evidence panel + agent reasoning panel + narrative editor + approval controls.

## Regulatory clocks vary by use case

- BSA SAR: 30 calendar days from initial detection (can extend to 60 with documented reason)
- Reg E dispute: 10 business days for provisional credit, 45 for final resolution (90 if foreign)
- State breach notification: varies (CA SB 1386 = "without unreasonable delay"; some states have explicit day counts)

The `regulatory-clock@1.0` fragment alarms at 50% / 75% / 90% of the deadline so the workflow surfaces stuck cases.

## Why approval gate is mandatory

Filings carry liability. The narrative is agent-drafted but the regulator-facing submission is human-approved. The agent runtime SA never publishes to `approval_events` — only the credit-officer-equivalent SA does.

## Fits

- SAR investigation (BSA)
- Reg E disputes
- State breach notifications
- Trade finance LC discrepancies
