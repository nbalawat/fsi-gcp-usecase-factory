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

