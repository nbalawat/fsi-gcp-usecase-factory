# sink-fanout@1.0

## What it does
Step 5 of the 5-step paradigm. Publishes the workflow outcome to N sinks in parallel — Pub/Sub topics, HTTP endpoints, or GCS objects — tracks per-sink success, and aggregates failures to a DLQ.

## When to use
At the tail of every workflow. Sinks are the only writers to BigQuery, document stores, GLs, and downstream queues — workflows themselves never write directly.

## Parameters
- `sinks` — list of `{name, kind, target, body_template}`. `kind` ∈ `pubsub | http | gcs`.
- `require_all` — when `true` (default) any failure triggers the DLQ + raise; when `false`, partial success is OK but failed sinks are still aggregated for visibility.
- `dlq_topic` — Pub/Sub topic for failure aggregation.

## Example instantiation
```yaml
sinks:
  - name: officer_queue
    kind: pubsub
    target: projects/bank-prod/topics/credit-officer-queue
    body_template: '${final_memo}'
  - name: doc_store
    kind: gcs
    target: gs://bank-prod-credit-memos/${context_id}/memo.json
    body_template: '${final_memo}'
  - name: gl_post
    kind: http
    target: https://gl-posting.run.app/post
    body_template: '${{"loan_id": event.loan.id, "amount": event.loan.amount}}'
require_all: true
dlq_topic: projects/bank-prod/topics/credit-memo-dlq
```

## Notes / TODO
- The `gcs` target parsing in the j2 uses `text.split` heuristics; the platform team should validate against the latest `googleapis.storage.v1.objects.insert` connector signature. **TODO(platform):** swap to `bucket`/`object` args once the connector is pinned.
