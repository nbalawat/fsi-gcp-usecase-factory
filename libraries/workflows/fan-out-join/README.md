# fan-out-join@1.0

## What it does
Calls N atomic services in parallel, waits for all, and aggregates each response body under a named key on a shared workflow variable.

## When to use
Step 2 of the 5-step paradigm — atomic-service enrichment. Use when the services are independent (no service depends on another's output). If there are dependencies, chain them sequentially or use multiple fan-out stages.

## Parameters
- `branches` — list of `{name, service_url, body_template}`. `name` becomes the key under `join_key`; `service_url` is the Cloud Run endpoint; `body_template` is a Cloud Workflows expression for the request body.
- `join_key` — the shared workflow var that collects results (e.g. `enriched`). Parent must initialize it (`enriched: {}`).

## Example instantiation
```yaml
branches:
  - name: spreader
    service_url: https://financial-spreader-xyz.run.app
    body_template: '${{"financials": event.financials, "context_id": context_id}}'
  - name: dscr
    service_url: https://dscr-calculator-xyz.run.app
    body_template: '${{"loan": event.loan, "context_id": context_id}}'
join_key: enriched
```

After execution, `enriched.spreader` and `enriched.dscr` hold the response bodies. Errors propagate via Cloud Workflows' default parallel-branch behavior — first failure cancels siblings.
