---
name: console-realtime
description: Knowledge for building the real-time console pattern. Auto-invoked when working on UI for sub-second high-volume use cases (payment fraud, RTP/FedNow, account takeover). Shows transaction throughput, latency budgets, decision streams, and decline reasons in real time.
---

# Real-time console

The real-time console serves work where sub-second decisions flow at high volume. The audience is keeping the rails healthy.

## When this console fits

- Time horizon: now (sub-second)
- Unit of work: transaction
- Volume-dominant (hundreds-to-thousands per second)
- Audience: payment ops manager, fraud ops manager

Use cases that fit: #4 payment fraud, #17 RTP/FedNow, #21 account takeover.

## Layout

Five visual zones:

1. **Header** — use case name, persona, "both rails live" status indicator
2. **Metric strip** (5 numbers) — txn/sec, P50 latency, P99 latency, decline rate, fraud caught (24h $)
3. **Mini-charts** — per-rail throughput and latency over the last 60 seconds (live updating)
4. **Decision stream** — scrolling tabular list: timestamp, rail, merchant, amount, result, latency
5. **Right rail** — declines by reason, SLA posture, models in use

## Decision stream row anatomy

```
[timestamp] [rail] [merchant] [$amount] [result · latency]
14:23:47.12 RTP    payroll    $1,200    cleared · 187ms
14:23:46.98 FedNow bus pmt    $4,400    declined · 234ms (velocity)
```

Each row has a left-border color encoding result (green cleared, red declined, amber gray-zone).

## Components used

From the shared library:
- Header strip with status pill
- Metric strip (5-wide)
- Mini-chart (60-bar histogram, two side-by-side)
- Live event ticker (decision stream)
- Right-rail summary panel

## Configuration

```json
{
  "console": "realtime",
  "use_case": "rtp_fednow",
  "persona": "Payment ops manager",
  "rails": [
    {"id": "rtp", "label": "RTP rail (TCH)", "color": "#5DCAA5"},
    {"id": "fednow", "label": "FedNow rail", "color": "#85B7EB"}
  ],
  "metrics": [
    {"id": "tps", "label": "Txn/sec"},
    {"id": "p50_latency", "label": "P50 latency", "unit": "ms"},
    {"id": "p99_latency", "label": "P99 latency", "unit": "ms"},
    {"id": "decline_rate", "label": "Decline rate", "unit": "%"},
    {"id": "fraud_caught_24h", "label": "Fraud caught (24h)", "unit": "$"}
  ],
  "decision_stream": {
    "max_rows": 30,
    "fields": ["timestamp", "rail", "merchant", "amount", "result", "latency"],
    "color_by": "result"
  },
  "decline_reasons": [
    "velocity_breach", "fraud_score_high", "beneficiary_screen",
    "liquidity_hold", "schema_invalid"
  ],
  "sla_budgets": {
    "fednow_window_ms": 1000,
    "rtp_window_ms": 1500
  }
}
```

## Data flow

The console subscribes to Pub/Sub topic `{use_case}.decisions` (or BigQuery streaming insert). New decisions appear at the top with a slide-in animation. Older decisions scroll off after 30 entries.

Mini-charts update every 1 second. Metric strip updates every 1-2 seconds. Decision stream updates as decisions arrive.

## Hard rules

- Latency budget gauge must always be visible (the headline SLO)
- Decline reasons must be a fixed enum (no free-text)
- "Demo simulation" badge required when running on synthetic data
- Display in tabular numeric font (`font-variant-numeric: tabular-nums`) so numbers don't jiggle
- No auto-pause on scroll (the stream is the point)

## Anti-patterns to refuse

- Animated counters that slot-machine up/down (looks fake)
- Showing every transaction's reasoning (volume-dominant — too much)
- Polling at 1-second intervals (use streaming)
- More than 3 metrics in the metric strip without thinning (cognitive overload)
- Hiding latency P99 (it's the SLO that breaks first)
