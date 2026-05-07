# gray-zone-fraud-scorer

Sub-second fraud-decision agent for cases the rules engine couldn't resolve.

## When to use

- Real-time payment fraud (card auth, ACH origination, RTP/FedNow)
- Account takeover detection during login
- Wire transfer triage at origination

## Why latency-critical

Rules-engine REFER decisions need to resolve in ≤300ms or the auth flow times out. The scorer's job is fast triage — not deep investigation. Deep investigation happens out-of-band on a separate path (see `triage-investigator-narrator` pattern).

## Why Gemini Flash

Sub-second p99 + 100k+ TPS. Opus would blow the latency budget.

## Instantiation example

```yaml
agents:
  - role: gray_zone_scorer
    archetype_ref: gray-zone-fraud-scorer@1.0
    params:
      input_schema: usecases/realtime-fraud/schemas/gray_zone_case.py
      tools: [velocity-check, device-fingerprint, geo-anomaly-detector, merchant-risk, watchlist-screen]
      latency_budget_ms: 250
      score_range: [0, 1000]
```
