# retry-with-backoff

Wrap a single HTTP call with exponential backoff + DLQ on terminal failure.

## When to use

Every fallible step in a workflow:
- Atomic service calls (network failures, transient overloads)
- Agent calls (model timeouts, rate limits)
- Sink publishes (Pub/Sub flow control)

## Defaults

- 3 retries (4 total attempts)
- 1 → 2 → 4 → 8 second backoff (max 60s)
- 30s timeout per attempt
- OIDC auth (Cloud Run / Workflows)
- DLQ on terminal failure (after retries exhausted)

## Usage

```yaml
{%- include "libraries/workflows/retry-with-backoff/fragment.yaml.j2" with
    step_name="call_dscr_calculator"
    target_url='${env.DSCR_CALCULATOR_URL + "/process"}'
    body='${{"context_id": context_id, "borrower_id": borrower_id, ...}}'
    dlq_topic="credit-memo-commercial.dlq"
    timeout_seconds=10
    max_attempts=3
%}
```

## DLQ message shape

```json
{
  "context_id": "...",
  "step": "call_dscr_calculator",
  "error": "<message>",
  "attempts": 4,
  "ts": "<ISO 8601>"
}
```

DLQ subscribers (the dlq-on-failure fragment's listener) consume these and route to the right human queue.

## Conventions

- One DLQ per use case (not per step) — easier to monitor.
- OIDC auth always-on for Cloud Run targets — never `--allow-unauthenticated`.
- `context_id` propagates via `X-Cloud-Trace-Context` header for trace correlation.
