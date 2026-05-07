#!/usr/bin/env bash
# wait_for_healthy.sh — poll services in a preview project until /healthz returns 200.
#
# Usage: wait_for_healthy.sh <project_id> <use_case>
#
# Invoked by: /promote (after deploy)
#
# STUB: implement against the bank's actual service discovery.

set -euo pipefail

PROJECT="${1:-}"
USE_CASE="${2:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"

if [ -z "$PROJECT" ] || [ -z "$USE_CASE" ]; then
    echo "Usage: $0 <project_id> <use_case>" >&2
    exit 2
fi

echo "→ Would wait for services in $PROJECT to become healthy"
echo "  TODO: implement service discovery and health polling:"
echo "    1. gcloud run services list --project=$PROJECT --format=json"
echo "    2. For each service: curl https://\$URL/healthz, expect 200"
echo "    3. Retry up to $TIMEOUT_SECONDS seconds total"
echo "    4. Fail fast if any service errors out"

# Stub: succeed immediately
sleep 1
echo "✓ All services healthy (stub)"
exit 0
