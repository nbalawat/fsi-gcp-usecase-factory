---
name: fsi-deploy
description: Deploy a use case's atomic services, handler, and wiring to a GCP environment. Reads REASONS canvas → fans out service deploys in parallel → smoke tests each → deploys handler → updates Pub/Sub subscription → patches manifest.json endpoints with real Cloud Run URLs. Reusable for any use case and any target environment (dev/staging/prod).
allowed-tools: Read, Glob, Grep, Bash(gcloud:*, bash:*, ls:*, cat:*, python3:*, jq:*)
---

You are the deploy orchestrator for a use case. You read the REASONS canvas to discover what to deploy, then drive the full deploy sequence with validation at each step.

## Inputs

```
/fsi-deploy <use_case_id> [--env=dev|staging|prod]
```

Defaults: `--env=dev`

## Step 1 — Resolve environment config

```bash
source dev.env   # sets GCP_PROJECT, REGION, SA_EMAIL, BQ_DATASET, etc.
```

For staging/prod: `source envs/<env>.env` instead. Never deploy to prod without explicit `--env=prod`.

Confirm environment before proceeding:
```
Deploying use case: <use_case_id>
Environment:        <env>
GCP project:        <GCP_PROJECT>
Region:             <REGION>
Service account:    <SA_EMAIL>
Proceed? (yes/no)
```

For `--env=dev`, skip the confirmation prompt and proceed automatically.

## Step 2 — Parse REASONS canvas for deployable operations

Read `usecases/<use_case_id>/reasons.yaml`. Collect all operations at layer 1:

```python
import yaml
with open(f"usecases/{use_case_id}/reasons.yaml") as f:
    canvas = yaml.safe_load(f)

layer1 = [op for op in canvas["operations"] if op["layer"] == 1]
services = [op for op in layer1 if op["kind"] == "atomic-service"]
handler  = next((op for op in layer1 if op["kind"] == "handler"), None)
```

Print the deploy plan:
```
Deploy plan for <use_case_id>:
  Atomic services (<N>):
    - <service_name>  [deployed | not deployed]
    - ...
  Handler:
    - <handler_name>  [deployed | not deployed]
```

Mark "deployed" if `.fsi-state/<name>.url` exists and is non-empty.

## Step 3 — Fan out atomic service deploys (parallel)

Deploy all atomic services simultaneously using `scripts/deploy_service.sh`:

```bash
bash scripts/deploy_service.sh <service_name>
```

Run all service deploys in parallel — launch them as background jobs, capture output per service, wait for all to finish:

```bash
declare -A pids
for svc in <services>; do
    bash scripts/deploy_service.sh "$svc" > /tmp/deploy_${svc}.log 2>&1 &
    pids[$svc]=$!
    echo "  Started deploy: $svc (pid ${pids[$svc]})"
done

# Wait for all
failed=()
for svc in "${!pids[@]}"; do
    if wait "${pids[$svc]}"; then
        echo "  [✓] $svc deployed"
    else
        echo "  [✗] $svc FAILED — see /tmp/deploy_${svc}.log"
        failed+=("$svc")
    fi
done

if [[ ${#failed[@]} -gt 0 ]]; then
    echo "Deploy failures: ${failed[*]}"
    echo "Fix and re-run. Successful deploys are preserved in .fsi-state/"
    exit 1
fi
```

**If a service already has a `.fsi-state/<name>.url`:** skip re-deploy unless `--force` flag is passed.

## Step 4 — Validate deployed services (parallel smoke tests)

After all parallel deploys complete, run smoke tests against GCP endpoints:

```bash
for svc in <services>; do
    bash scripts/smoke_test_service.sh "$svc" --gcp
done
```

Run in parallel (same pattern as Step 3). A smoke test failure is a WARN, not a hard stop — the handler can still deploy, but note the failing service.

After smoke tests, invoke `deploy-validator` subagent for each service to record the result.

## Step 5 — Patch manifest.json endpoints with real URLs

For each deployed atomic service, update its `manifest.json` with the real Cloud Run URL from `.fsi-state/<name>.url`:

```python
import json, pathlib

for svc_name in services:
    url_file = pathlib.Path(f".fsi-state/{svc_name}.url")
    if not url_file.exists():
        continue
    url = url_file.read_text().strip()

    manifest_path = pathlib.Path(f"services/atomic/{svc_name}/manifest.json")
    manifest = json.loads(manifest_path.read_text())
    manifest["endpoint"] = url
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  Patched {svc_name} endpoint: {url}")
```

This ensures agents' tool definitions have real endpoints at Layer 2.

## Step 6 — Deploy handler

After all atomic services are up and manifests are patched, deploy the handler:

```bash
# Derive handler name from use_case_id
handler_name="<use_case_id>"  # e.g. "credit-memo-commercial"
bash scripts/deploy_service.sh "$handler_name"
```

Handler depends on services being up first — do not parallelize with Step 3.

## Step 7 — Wire Pub/Sub push subscription

After handler deploys, update the push subscription with the handler's Cloud Run URL:

```bash
HANDLER_URL=$(cat ".fsi-state/${use_case_id}.url")
TRIGGER_TOPIC=$(python3 -c "
import yaml
with open('usecases/${use_case_id}/reasons.yaml') as f:
    c = yaml.safe_load(f)
handler = next(op for op in c['operations'] if op['kind'] == 'handler')
print(handler['spec']['trigger_topic'])
")

# Subscription name: <use_case_id>-push-sub
SUB_NAME="${use_case_id}-push-sub"
PROJECT=$(python3 -c "import os; print(os.environ['GCP_PROJECT'])")

# Create or update push subscription
gcloud pubsub subscriptions modify-push-config "$SUB_NAME" \
    --push-endpoint="${HANDLER_URL}" \
    --push-auth-service-account="${SA_EMAIL}" \
    --project="$PROJECT" 2>/dev/null || \
gcloud pubsub subscriptions create "$SUB_NAME" \
    --topic="$TRIGGER_TOPIC" \
    --push-endpoint="${HANDLER_URL}" \
    --push-auth-service-account="${SA_EMAIL}" \
    --ack-deadline=60 \
    --project="$PROJECT"

echo "  Pub/Sub push subscription wired: $SUB_NAME → $HANDLER_URL"
```

## Step 8 — Report

```
/fsi-deploy <use_case_id> [env] complete
─────────────────────────────────────────────
Atomic services deployed:
  ✓ financial-spreader   https://fsi-atomic-financial-spreader-xxx.run.app
  ✓ dscr-calculator      https://fsi-atomic-dscr-calculator-xxx.run.app
  ✓ covenant-analyzer    https://fsi-atomic-covenant-analyzer-xxx.run.app
  ✓ peer-benchmarker     https://fsi-atomic-peer-benchmarker-xxx.run.app
  ✓ industry-risk-scorer https://fsi-atomic-industry-risk-scorer-xxx.run.app
  ✓ collateral-valuator  https://fsi-atomic-collateral-valuator-xxx.run.app
  ✓ exposure-aggregator  https://fsi-atomic-exposure-aggregator-xxx.run.app

Handler deployed:
  ✓ credit-memo-commercial  https://fsi-handler-credit-memo-commercial-xxx.run.app

Smoke tests:
  ✓ 7/7 services passed
  ✓ handler passed

Pub/Sub:
  ✓ credit-memo-commercial-push-sub → handler URL

Manifest endpoints patched: 7/7

Elapsed: <T>s
─────────────────────────────────────────────
Next step: /fsi-build-parallel <use_case_id> Layer 3
  (workflow-builder, terraform-author, console-config-builder, e2e-test-builder
   now have real endpoints from manifest.json)
```

## Discipline rules

- **Atomic services deploy in parallel.** They are stateless and independent.
- **Handler deploys after services.** It depends on services being available.
- **Pub/Sub wires after handler.** Events only flow after the handler URL is confirmed.
- **Manifest patching is idempotent.** Re-running /fsi-deploy updates the URL if it changed.
- **Skip already-deployed services** unless `--force` is passed.
- **Never deploy to prod** without explicit `--env=prod` and a preceding `/promote` gate.
- **`.fsi-state/` is gitignored** — it holds runtime URLs, not source artifacts.
- **Smoke test failures are WARN, not FAIL.** They block Layer 3 if critical services fail, but do not roll back deployed services.
