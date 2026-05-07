# dlq-on-failure@1.0

## What it does
Inside a parent `try/except` block, emits a structured DLQ message containing the failed step name, error details, retry count, and the original payload — then re-raises so the parent decides whether to abort or continue.

## When to use
Splice into the `except:` arm of any step that processes a replayable payload (handler enrichment, agent invocation, sink dispatch). Combined with `/replay-incident`, the DLQ envelope is the canonical replay input.

## Parameters
- `dlq_topic` — Pub/Sub topic for DLQ envelopes.
- `original_payload_var` — name of the workflow var holding the payload to preserve (typically `event` or `enriched`).
- `step_name` — logical name of the failing step (becomes the `failed_step` field — dashboard pivot).
- `error_var` — exception var captured by parent's `except: as: <name>` clause. Default `e`.

## Example instantiation
```yaml
dlq_topic: projects/bank-prod/topics/credit-memo-dlq
original_payload_var: event
step_name: agent_supervisor_invocation
error_var: e
```

Spliced inside:
```yaml
- invoke_supervisor:
    try:
      # ... main step ...
    except:
      as: e
      steps:
        # ↓ this fragment renders here
```
