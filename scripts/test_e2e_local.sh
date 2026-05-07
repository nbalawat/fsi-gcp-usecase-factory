#!/usr/bin/env bash
# test_e2e_local.sh — Layer 5: local emulator integration tests.
#
# Boots Pub/Sub emulator + checks services exist, then runs pytest -m "not live".
# Requires: gcloud beta emulators pubsub (or docker-compose with pubsub emulator image).
#
# Usage:
#   bash scripts/test_e2e_local.sh credit-memo-commercial
#   bash scripts/test_e2e_local.sh credit-memo-commercial --record    # re-record LLM fixtures
#
# Exit codes: 0=all pass, 1=failures, 2=setup error
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UC="${1:-}"
RECORD=""
if [[ "$*" == *"--record"* ]]; then RECORD="--record-llm"; fi

if [[ -z "$UC" ]]; then
    echo "usage: $0 <use_case_id> [--record]" >&2
    exit 2
fi

TEST_DIR="$REPO_ROOT/usecases/$UC/tests"
if [[ ! -d "$TEST_DIR" ]]; then
    echo "ERROR: $TEST_DIR not found — run /fsi-build-parallel first" >&2
    exit 2
fi

echo "=== test_e2e_local: $UC ==="
echo ""

# Check for Pub/Sub emulator
EMULATOR_PID=""
cleanup() {
    if [[ -n "$EMULATOR_PID" ]]; then
        kill "$EMULATOR_PID" 2>/dev/null || true
        echo "Pub/Sub emulator stopped."
    fi
}
trap cleanup EXIT

if [[ -z "${PUBSUB_EMULATOR_HOST:-}" ]]; then
    echo "[setup] Starting Pub/Sub emulator..."
    if command -v gcloud &>/dev/null; then
        gcloud beta emulators pubsub start --host-port=localhost:8085 &
        EMULATOR_PID=$!
        export PUBSUB_EMULATOR_HOST="localhost:8085"
        sleep 3
        echo "[setup] Emulator started (PID $EMULATOR_PID)"
    elif command -v docker &>/dev/null; then
        echo "[setup] Starting Pub/Sub emulator via Docker..."
        docker run -d --rm --name pubsub-emulator -p 8085:8085 \
            gcr.io/google.com/cloudsdktool/cloud-sdk:latest \
            gcloud beta emulators pubsub start --host-port=0.0.0.0:8085
        export PUBSUB_EMULATOR_HOST="localhost:8085"
        sleep 5
        echo "[setup] Emulator started via Docker"
    else
        echo "WARN: No Pub/Sub emulator available (no gcloud or docker)."
        echo "      Set PUBSUB_EMULATOR_HOST if emulator runs elsewhere."
        echo "      Tests will be skipped via conftest.py."
    fi
else
    echo "[setup] Using existing PUBSUB_EMULATOR_HOST=$PUBSUB_EMULATOR_HOST"
fi

# Collect tests
echo ""
echo "[collect] Counting e2e tests..."
test_count=$(python3 -m pytest "$TEST_DIR" --collect-only -q --no-header 2>/dev/null | grep -c "test session starts\|<" || echo "0")
echo "[collect] Test directory: $TEST_DIR"

# Run Layer 5 tests (skip @live)
echo ""
echo "[run] Running Layer 5 tests (skipping @live)..."
if python3 -m pytest \
    "$TEST_DIR" \
    -m "not live" \
    --tb=short \
    --no-header \
    -q \
    ${RECORD:+"-p no:cacheprovider"} \
    2>&1; then
    echo ""
    echo "=== Layer 5 PASS ==="
    exit 0
else
    echo ""
    echo "=== Layer 5 FAIL ==="
    exit 1
fi
