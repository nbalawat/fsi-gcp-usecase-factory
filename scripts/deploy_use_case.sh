#!/usr/bin/env bash
# deploy_use_case.sh — deploy all atomic services + handler for a use case.
# Reads REASONS canvas to discover services, deploys in parallel, patches manifests.
#
# Usage:
#   source dev.env && bash scripts/deploy_use_case.sh credit-memo-commercial
#   source dev.env && bash scripts/deploy_use_case.sh credit-memo-commercial --force
#
# --force: re-deploy even if .fsi-state/<service>.url exists
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USE_CASE="${1:-}"
FORCE="${2:-}"

if [[ -z "$USE_CASE" ]]; then
    echo "usage: source dev.env && bash scripts/deploy_use_case.sh <use_case_id> [--force]" >&2
    exit 2
fi

REASONS="$REPO_ROOT/usecases/$USE_CASE/reasons.yaml"
if [[ ! -f "$REASONS" ]]; then
    echo "ERROR: $REASONS not found" >&2
    exit 2
fi

# Parse atomic service names from REASONS canvas
ATOMIC_SERVICES=()
while IFS= read -r line; do
    # Match lines like:   path: "services/atomic/dscr-calculator/"
    if [[ "$line" =~ services/atomic/([a-z0-9-]+) ]]; then
        svc="${BASH_REMATCH[1]}"
        # Deduplicate
        already=false
        for existing in "${ATOMIC_SERVICES[@]:-}"; do
            [[ "$existing" == "$svc" ]] && already=true && break
        done
        $already || ATOMIC_SERVICES+=("$svc")
    fi
done < "$REASONS"

# Parse handler name. Handlers live under usecases/<uc>/handler/ — the handler name
# matches the use_case_id by convention.
HANDLER_NAME=""
if [[ -d "$REPO_ROOT/usecases/$USE_CASE/handler" ]]; then
    HANDLER_NAME="$USE_CASE"
else
    # Legacy reasons.yaml path lookup (services/handlers/<uc>/) for backwards compat
    while IFS= read -r line; do
        if [[ "$line" =~ usecases/([a-z0-9-]+)/handler ]] || \
           [[ "$line" =~ services/handlers/([a-z0-9-]+) ]]; then
            HANDLER_NAME="${BASH_REMATCH[1]}"
            break
        fi
    done < "$REASONS"
fi

echo "=== /fsi-deploy $USE_CASE [dev] ==="
echo ""
echo "Atomic services (${#ATOMIC_SERVICES[@]}):"
for svc in "${ATOMIC_SERVICES[@]}"; do
    url_file="$REPO_ROOT/.fsi-state/${svc}.url"
    if [[ -f "$url_file" ]] && [[ "$FORCE" != "--force" ]]; then
        echo "  [skip] $svc — already deployed (use --force to redeploy)"
    else
        echo "  [todo] $svc"
    fi
done
echo "Handler: ${HANDLER_NAME:-none found}"
echo ""

# ── Step 3: Fan out atomic service deploys in parallel ────────────────────────

DEPLOY_PIDS=()
DEPLOY_SVCS=()

for svc in "${ATOMIC_SERVICES[@]}"; do
    url_file="$REPO_ROOT/.fsi-state/${svc}.url"
    if [[ -f "$url_file" ]] && [[ "$FORCE" != "--force" ]]; then
        continue
    fi
    bash "$REPO_ROOT/scripts/deploy_service.sh" "$svc" \
        > "/tmp/fsi_deploy_${svc}.log" 2>&1 &
    DEPLOY_PIDS+=($!)
    DEPLOY_SVCS+=("$svc")
    echo "  → deploying $svc (pid $!)"
done

if [[ ${#DEPLOY_PIDS[@]} -gt 0 ]]; then
    echo ""
    echo "Waiting for ${#DEPLOY_PIDS[@]} parallel deploys..."
fi

# Join
FAILED=()
for i in "${!DEPLOY_PIDS[@]}"; do
    svc="${DEPLOY_SVCS[$i]}"
    pid="${DEPLOY_PIDS[$i]}"
    if wait "$pid"; then
        url=$(cat "$REPO_ROOT/.fsi-state/${svc}.url" 2>/dev/null | tr -d '\n')
        echo "  [✓] $svc → $url"
    else
        echo "  [✗] $svc FAILED"
        tail -8 "/tmp/fsi_deploy_${svc}.log" | sed 's/^/      /'
        FAILED+=("$svc")
    fi
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo ""
    echo "ERROR: ${#FAILED[@]} services failed to deploy: ${FAILED[*]}"
    echo "Fix the errors above and re-run. Successful deploys are preserved."
    exit 1
fi

# ── Step 5: Patch manifest.json endpoints ────────────────────────────────────

echo ""
echo "Patching manifest.json endpoints..."
python3 - << 'PYEOF'
import json, pathlib, os, sys

repo = pathlib.Path(os.environ.get("REPO_ROOT", "."))
fsi_state = repo / ".fsi-state"
patched = 0

for url_file in fsi_state.glob("*.url"):
    svc_name = url_file.stem
    manifest_path = repo / "services" / "atomic" / svc_name / "manifest.json"
    if not manifest_path.exists():
        continue
    url = url_file.read_text().strip()
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("endpoint") != url:
        manifest["endpoint"] = url
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"  patched {svc_name} → {url}")
        patched += 1
    else:
        print(f"  ok      {svc_name} (endpoint already current)")

print(f"  {patched} manifest(s) updated")
PYEOF

# ── Step 6: Deploy handler ────────────────────────────────────────────────────

if [[ -n "$HANDLER_NAME" ]]; then
    echo ""
    echo "Deploying handler: $HANDLER_NAME"
    bash "$REPO_ROOT/scripts/deploy_service.sh" "$HANDLER_NAME" \
        | tee "/tmp/fsi_deploy_handler_${HANDLER_NAME}.log"
else
    echo ""
    echo "No handler found in REASONS canvas — skipping handler deploy"
fi

# ── Step 7: Wire Pub/Sub push subscription ────────────────────────────────────

if [[ -n "$HANDLER_NAME" ]]; then
    HANDLER_URL=$(cat "$REPO_ROOT/.fsi-state/${HANDLER_NAME}.url" 2>/dev/null | tr -d '\n')
    if [[ -z "$HANDLER_URL" ]]; then
        echo "WARN: handler URL not found in .fsi-state — skipping Pub/Sub wiring" >&2
    else
        PROJECT="${GCP_PROJECT:-agentic-experiments}"
        SA_EMAIL="fsi-gcp-factory-usecases@${PROJECT}.iam.gserviceaccount.com"
        SUB_NAME="${USE_CASE}-push-sub"

        # Get trigger topic from REASONS
        TRIGGER_TOPIC=$(python3 -c "
import yaml, sys
with open('$REASONS') as f:
    c = yaml.safe_load(f)
ops = c.get('operations', [])
handler = next((op for op in ops if op.get('kind') == 'handler'), None)
if handler:
    print(handler.get('spec', {}).get('trigger_topic', ''))
" 2>/dev/null || echo "")

        if [[ -z "$TRIGGER_TOPIC" ]]; then
            echo "WARN: trigger_topic not found in REASONS — skipping Pub/Sub wiring" >&2
        else
            echo ""
            echo "Wiring Pub/Sub push subscription..."
            echo "  subscription: $SUB_NAME"
            echo "  topic:        $TRIGGER_TOPIC"
            echo "  endpoint:     $HANDLER_URL"

            # Try modify first (update existing), then create
            if gcloud pubsub subscriptions modify-push-config "$SUB_NAME" \
                --push-endpoint="${HANDLER_URL}" \
                --push-auth-service-account="$SA_EMAIL" \
                --project="$PROJECT" 2>/dev/null; then
                echo "  [✓] subscription updated"
            elif gcloud pubsub subscriptions create "$SUB_NAME" \
                --topic="$TRIGGER_TOPIC" \
                --push-endpoint="${HANDLER_URL}" \
                --push-auth-service-account="$SA_EMAIL" \
                --ack-deadline=60 \
                --project="$PROJECT" 2>/dev/null; then
                echo "  [✓] subscription created"
            else
                echo "  [⚠] could not wire Pub/Sub — check topic exists and SA has pubsub.subscriber role"
            fi
        fi
    fi
fi

# ── Report ────────────────────────────────────────────────────────────────────

echo ""
echo "=== Deploy complete: $USE_CASE ==="
echo ""
echo "Services:"
for svc in "${ATOMIC_SERVICES[@]}"; do
    url=$(cat "$REPO_ROOT/.fsi-state/${svc}.url" 2>/dev/null | tr -d '\n' || echo "not deployed")
    printf "  ✓ %-30s %s\n" "$svc" "$url"
done

if [[ -n "$HANDLER_NAME" ]]; then
    url=$(cat "$REPO_ROOT/.fsi-state/${HANDLER_NAME}.url" 2>/dev/null | tr -d '\n' || echo "not deployed")
    printf "  ✓ %-30s %s\n" "$HANDLER_NAME (handler)" "$url"
fi

echo ""
echo "Next: run smoke tests and then /fsi-build-parallel $USE_CASE (Layer 3)"
echo "  bash scripts/smoke_test_service.sh <service> --gcp"
