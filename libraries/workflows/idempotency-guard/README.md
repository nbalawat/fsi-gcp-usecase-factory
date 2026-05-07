# idempotency-guard

Dedupe Cloud Workflow replays via a Firestore-backed atomic CAS.

## Why this exists

Pub/Sub guarantees at-least-once delivery, so handlers and workflows see replays. Without an idempotency guard, every retry creates duplicate audit rows, duplicate GL postings, duplicate downstream events.

## How it works

1. On entry, look up `firestore_collection/<context_id>`.
2. If the document exists → emit `{idempotent_replay: true, original_run_at: ...}` and return early.
3. If it doesn't → write the document atomically (CAS) and continue with the rest of the workflow.

The Firestore TTL field reaps records after `ttl_hours` — typically 7 days, longer than any plausible Pub/Sub redelivery window.

## Usage

Render at the top of a workflow, before any side-effecting step:

```yaml
{%- include "libraries/workflows/idempotency-guard/fragment.yaml.j2" with
    context_id_expr="event.context_id"
    firestore_collection="credit_memo_idempotency"
    ttl_hours=168
%}

# ... rest of the workflow
```

## Conventions

- Dedup key MUST be `context_id` (the bank's universal correlation key) — never auto-generate a different key.
- One Firestore collection per use case. Don't share across UCs (eviction confusion).
- TTL ≥ Pub/Sub max retry window (default 7 days). Shorter TTLs risk false re-execution.

## Tests

- `tests/render_test.yaml` — render with sample params; assert produced YAML is valid Cloud Workflows.
