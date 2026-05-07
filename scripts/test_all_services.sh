#!/usr/bin/env bash
# test_all_services.sh — run each atomic service's unit tests in its own subprocess.
# Microservices are independent deployments; shared pytest process causes module collisions.
#
# Usage:
#   bash scripts/test_all_services.sh              # all services
#   bash scripts/test_all_services.sh financial-spreader  # one service
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0; TOTAL=0

run_service_tests() {
    local svc_dir="$1"
    local svc_name
    svc_name="$(basename "$svc_dir")"
    local test_dir="$svc_dir/tests"

    [[ -d "$test_dir" ]] || { echo "  – $svc_name (no tests/)"; return; }

    TOTAL=$((TOTAL + 1))
    result=$(cd "$svc_dir" && /usr/local/bin/python3 -m pytest tests/ -q --tb=short 2>&1)
    last_line=$(echo "$result" | tail -1)

    if echo "$last_line" | grep -q "passed"; then
        printf '\033[32m✓\033[0m %s — %s\n' "$svc_name" "$last_line"
        PASS=$((PASS + 1))
    else
        printf '\033[31m✗\033[0m %s — FAIL\n' "$svc_name"
        echo "$result" | grep -E "FAILED|ERROR|assert" | head -5 | sed 's/^/    /'
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Service unit tests ==="
echo ""

TARGET="${1:-}"

if [[ -n "$TARGET" ]]; then
    for base in services/atomic services/handlers; do
        [[ -d "$REPO_ROOT/$base/$TARGET" ]] && run_service_tests "$REPO_ROOT/$base/$TARGET"
    done
else
    echo "Atomic services:"
    for svc_dir in "$REPO_ROOT/services/atomic"/*/; do
        [[ -d "$svc_dir" ]] && run_service_tests "$svc_dir"
    done
    echo ""
    echo "Handlers:"
    for svc_dir in "$REPO_ROOT/services/handlers"/*/; do
        [[ -d "$svc_dir" ]] && run_service_tests "$svc_dir"
    done
fi

echo ""
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
