#!/usr/bin/env bash
# run_local.sh — run an atomic service or handler locally with real GCP credentials.
#
# Uses functions-framework so the local server behaves identically to Cloud Run.
# GCP calls (BigQuery, GCS, Pub/Sub) hit the real project — no emulator.
#
# Usage:
#   source dev.env && bash scripts/run_local.sh financial-spreader
#   source dev.env && bash scripts/run_local.sh financial-spreader --port 8081
#
# In another terminal, test with:
#   bash scripts/smoke_test_service.sh financial-spreader --local
#
# Press Ctrl+C to stop.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="${1:-}"
PORT="${PORT:-8080}"

# Override port if --port flag given
if [[ "$*" == *"--port"* ]]; then
    PORT=$(echo "$*" | grep -oP '(?<=--port )\d+')
fi

if [[ -z "$SERVICE" ]]; then
    echo "usage: source dev.env && bash scripts/run_local.sh <service-name> [--port N]" >&2
    echo ""
    echo "Available services:"
    ls "$REPO_ROOT/services/atomic/" 2>/dev/null | sed 's/^/  atomic\//'
    ls "$REPO_ROOT/services/handlers/" 2>/dev/null | sed 's/^/  handlers\//'
    exit 2
fi

# Locate service directory
if [[ -d "$REPO_ROOT/services/atomic/$SERVICE" ]]; then
    SERVICE_DIR="$REPO_ROOT/services/atomic/$SERVICE"
    ENTRY_POINT="main"
elif [[ -d "$REPO_ROOT/services/handlers/$SERVICE" ]]; then
    SERVICE_DIR="$REPO_ROOT/services/handlers/$SERVICE"
    ENTRY_POINT="handle"
else
    echo "ERROR: service '$SERVICE' not found in services/atomic/ or services/handlers/" >&2
    exit 2
fi

echo "=== run_local: $SERVICE ==="
echo "    dir:        $SERVICE_DIR"
echo "    entry:      $ENTRY_POINT"
echo "    port:       $PORT"
echo "    project:    ${GCP_PROJECT:-NOT SET — source dev.env first}"
echo "    creds:      ${GOOGLE_APPLICATION_CREDENTIALS:-NOT SET}"
echo ""

if [[ -z "${GCP_PROJECT:-}" ]]; then
    echo "ERROR: GCP_PROJECT not set. Run: source dev.env" >&2
    exit 2
fi
if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
    echo "ERROR: GOOGLE_APPLICATION_CREDENTIALS not set. Run: source dev.env" >&2
    exit 2
fi

# Install functions-framework if missing
if ! python3 -c "import functions_framework" &>/dev/null; then
    echo "[setup] Installing functions-framework..."
    pip3 install functions-framework --quiet
fi

# Install service dependencies if pyproject.toml exists
if [[ -f "$SERVICE_DIR/pyproject.toml" ]]; then
    echo "[setup] Installing service dependencies..."
    pip3 install -e "$SERVICE_DIR[dev]" --quiet 2>/dev/null || \
    pip3 install -e "$SERVICE_DIR" --quiet 2>/dev/null || true
fi

echo "[start] Starting $SERVICE on http://localhost:$PORT"
echo "        POST / with JSON payload to test"
echo "        Ctrl+C to stop"
echo ""

cd "$SERVICE_DIR"
exec functions-framework \
    --target="$ENTRY_POINT" \
    --port="$PORT" \
    --debug
