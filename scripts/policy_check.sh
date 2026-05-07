#!/usr/bin/env bash
# policy_check.sh — run OPA / conftest policies against generated Terraform.
#
# Usage: policy_check.sh <path/to/terraform>
#
# Invoked by: /new-atomic-service, /review-uc, /promote

set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
    echo "Usage: $0 <path/to/terraform/file/or/dir>" >&2
    exit 2
fi

if [ ! -e "$TARGET" ]; then
    echo "Target not found: $TARGET" >&2
    exit 1
fi

POLICIES="${CLAUDE_PLUGIN_DIR:-.}/policies"

if ! command -v conftest >/dev/null 2>&1; then
    echo "conftest not installed; skipping policy check"
    echo "  Install: https://www.conftest.dev/install/"
    exit 0
fi

if [ ! -d "$POLICIES" ]; then
    echo "Policies directory not found: $POLICIES; skipping"
    exit 0
fi

REGOS=$(find "$POLICIES" -name "*.rego" 2>/dev/null | wc -l | xargs)
if [ "$REGOS" = "0" ]; then
    echo "No .rego policies in $POLICIES; skipping"
    exit 0
fi

echo "→ Running conftest with $REGOS policies against $TARGET"
conftest test --policy "$POLICIES" "$TARGET"
