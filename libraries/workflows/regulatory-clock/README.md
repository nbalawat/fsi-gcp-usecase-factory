# regulatory-clock@1.0

## What it does
Runs a parallel branch alongside the main workflow that publishes alerts at percent-elapsed thresholds and a breach event when the deadline passes. On breach, takes the configured action (`alarm`, `escalate`, `terminate-workflow`).

## When to use
Any workflow with a regulator-set deadline (Reg E 10-day investigation, Reg CC funds availability, OCC 5-business-day credit decision, SAR 30-day filing, Reg B 30-day adverse action). Wire it as a parallel branch in the parent workflow alongside the main pipeline.

## Parameters
- `deadline_iso` — absolute ISO timestamp or ISO duration (`PT120H` = 120 hours).
- `alert_thresholds_pct` — list of percent-elapsed alert points. Default `[50, 75, 90]`.
- `alert_topic` — Pub/Sub topic for thresholds + breach events. Console UIs subscribe.
- `breach_action` — `alarm` (publish + continue), `escalate` (publish escalation + continue — parent must subscribe), `terminate-workflow` (raise).

## Example instantiation
```yaml
deadline_iso: "PT120H"   # 5 business days from workflow start
alert_thresholds_pct: [50, 75, 90]
alert_topic: projects/bank-prod/topics/regclock-credit-memo
breach_action: escalate
```

## Notes / TODO
- The deadline math uses `time.parse` + arithmetic on `sys.now()`. **TODO(platform):** confirm Cloud Workflows `time` stdlib supports the `(start + (deadline - start) * pct / 100)` expression as written; otherwise pre-compute thresholds in an init step.
- For ISO durations the parent workflow should resolve `deadline_iso` to an absolute timestamp before splicing.
