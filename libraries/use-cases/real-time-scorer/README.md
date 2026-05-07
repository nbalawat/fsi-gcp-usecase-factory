# Use-case archetype: real-time-scorer

Whole-use-case template for sub-second high-volume decisioning. Card fraud, ACH fraud, RTP/FedNow scoring, account takeover at login.

## Shape

```
event-arrives → [handler] (≤10ms validation)
                ↓
            [fan-out atomic services] (parallel, ≤200ms cap)
                ↓
            [rules-service] (deterministic gate, ≤50ms p99)
                ↓
        decision == REFER? ┼─ no ──→ [scoring-sink] (allow / decline / step-up)
                ↓
            [gray-zone-fraud-scorer] (Flash, ≤250ms)
                ↓
            [scoring-sink]
```

## Picks the realtime-console

Sub-second decisions, throughput-dominant. The console shows:
- Live transaction throughput
- Latency p50/p99 strip
- Decision-stream live ticker
- Decline-reason breakdown

## Why no approval gate

Real-time means "decision in flight while customer waits at the POS / on the website". Human review is impossible inside the latency budget. Step-up to a second factor is the closest thing — but the workflow itself doesn't pause.

## Why no regulatory clock

Decisions complete in milliseconds. There's no "5-day window" — the regulatory clock pattern fits investigations, not real-time scoring.

## Instantiation

`/new-use-case` with archetype = `real-time-scorer@1.0` produces a `usecases/<uc>/reasons.yaml` skeleton with the right Norms (p99 latency cap), Safeguards (fail-open semantics), and Operations DAG.
