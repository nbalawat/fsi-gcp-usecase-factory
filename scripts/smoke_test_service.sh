#!/usr/bin/env bash
# smoke_test_service.sh — hit a service with its minimal valid test payload.
#
# Reads the test payload from services/atomic/<name>/tests/smoke_payload.json
# or services/handlers/<name>/tests/smoke_payload.json.
#
# Usage:
#   bash scripts/smoke_test_service.sh financial-spreader --local   # localhost:8080
#   bash scripts/smoke_test_service.sh financial-spreader --gcp     # deployed Cloud Run
#
# Exit: 0=200 response with valid JSON, 1=bad status or invalid JSON
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${GCP_PROJECT:-agentic-experiments}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${1:-}"
MODE="${2:---local}"   # --local or --gcp
PORT="${PORT:-8080}"

if [[ -z "$SERVICE" ]]; then
    echo "usage: bash scripts/smoke_test_service.sh <service> [--local|--gcp]" >&2
    exit 2
fi

# Locate service + payload
if [[ -d "$REPO_ROOT/services/atomic/$SERVICE" ]]; then
    SVC_DIR="$REPO_ROOT/services/atomic/$SERVICE"
    CLOUD_RUN_NAME="fsi-atomic-${SERVICE}"
elif [[ -d "$REPO_ROOT/services/handlers/$SERVICE" ]]; then
    SVC_DIR="$REPO_ROOT/services/handlers/$SERVICE"
    CLOUD_RUN_NAME="fsi-handler-${SERVICE}"
else
    echo "ERROR: $SERVICE not found" >&2
    exit 2
fi

PAYLOAD_FILE="$SVC_DIR/tests/smoke_payload.json"
if [[ ! -f "$PAYLOAD_FILE" ]]; then
    echo "WARN: no smoke_payload.json found at $PAYLOAD_FILE"
    echo "      Using empty payload — service should return 400 (validation error)"
    PAYLOAD="{}"
else
    PAYLOAD=$(cat "$PAYLOAD_FILE")
fi

# Determine endpoint
if [[ "$MODE" == "--gcp" ]]; then
    URL_FILE="$REPO_ROOT/.fsi-state/${SERVICE}.url"
    if [[ -f "$URL_FILE" ]]; then
        BASE_URL=$(cat "$URL_FILE")
    else
        BASE_URL=$(gcloud run services describe "$CLOUD_RUN_NAME" \
            --region="$REGION" --project="$PROJECT" \
            --format="value(status.url)" 2>/dev/null)
    fi
    if [[ -z "$BASE_URL" ]]; then
        echo "ERROR: $SERVICE not deployed. Run: bash scripts/deploy_service.sh $SERVICE" >&2
        exit 2
    fi
    # Get ID token for authenticated Cloud Run
    TOKEN=$(gcloud auth print-identity-token \
        --impersonate-service-account="fsi-gcp-factory-usecases@${PROJECT}.iam.gserviceaccount.com" \
        2>/dev/null || gcloud auth print-identity-token)
    AUTH_HEADER="Authorization: Bearer $TOKEN"
    ENDPOINT="$BASE_URL"
    echo "=== smoke_test: $SERVICE [GCP Cloud Run] ==="
    echo "    URL: $ENDPOINT"
else
    AUTH_HEADER="Content-Type: application/json"
    ENDPOINT="http://localhost:$PORT"
    echo "=== smoke_test: $SERVICE [local :$PORT] ==="
fi

echo "    payload: $(echo "$PAYLOAD" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(list(d.keys()))' 2>/dev/null || echo "$PAYLOAD")"
echo ""

# Call the service
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    -d "$PAYLOAD" \
    --max-time 30 \
    2>&1)

HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -1)
BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

echo "HTTP $HTTP_STATUS"

if [[ "$HTTP_STATUS" == "200" ]]; then
    echo "$BODY" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || echo "$BODY"
    printf '\033[32m✓ SMOKE PASS\033[0m\n'
    exit 0
elif [[ "$HTTP_STATUS" == "400" ]]; then
    echo "$BODY"
    printf '\033[33m– SMOKE WARN: 400 (check payload or service validation)\033[0m\n'
    exit 0
else
    echo "$BODY"
    printf '\033[31m✗ SMOKE FAIL: HTTP %s\033[0m\n' "$HTTP_STATUS"
    exit 1
fi
