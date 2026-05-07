#!/usr/bin/env bash
# validate_use_case.sh — Layer 4: workflow + IaC + policy validation for a use case.
#
# Usage:
#   bash scripts/validate_use_case.sh credit-memo-commercial
#   bash scripts/validate_use_case.sh credit-memo-commercial --strict   # strict REASONS ref check
#
# Runs:
#   1. REASONS reference resolution (resolve_reasons_refs.py)
#   2. Workflow YAML lint (workflow_lint.sh)
#   3. JDM rule lint (jdm_lint.sh) for all rules in reasons.yaml
#   4. Python ruff + mypy on usecases/<uc>/handler/ and usecases/<uc>/agents/
#   5. OPA/conftest policy check on usecases/<uc>/infra/<uc>.tf (if present)
#
# Exit codes: 0=all pass, 1=one or more fail, 2=setup error
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UC="${1:-}"
STRICT=""
if [[ "$*" == *"--strict"* ]]; then STRICT="--strict"; fi

if [[ -z "$UC" ]]; then
    echo "usage: $0 <use_case_id> [--strict]" >&2
    exit 2
fi

REASONS="$REPO_ROOT/usecases/$UC/reasons.yaml"
if [[ ! -f "$REASONS" ]]; then
    echo "ERROR: $REASONS not found" >&2
    exit 2
fi

PASS=0
FAIL=0

ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; ((PASS++)); }
fail() { printf '\033[31m✗\033[0m %s\n' "$*"; ((FAIL++)); }
skip() { printf '\033[33m–\033[0m %s (skipped — not found)\n' "$*"; }

echo "=== validate_use_case: $UC ==="
echo ""

# 1. REASONS reference check
echo "[1/5] REASONS reference resolution"
if python3 "$REPO_ROOT/scripts/resolve_reasons_refs.py" $STRICT "$REASONS"; then
    ok "REASONS refs"
else
    fail "REASONS refs — run: python3 scripts/resolve_reasons_refs.py $STRICT $REASONS"
fi

# 2. Workflow lint
echo ""
echo "[2/5] Workflow YAML lint"
WORKFLOW="$REPO_ROOT/usecases/$UC/workflow.yaml"
if [[ -f "$WORKFLOW" ]]; then
    if bash "$REPO_ROOT/scripts/workflow_lint.sh" "$WORKFLOW"; then
        ok "workflow $UC/workflow.yaml"
    else
        fail "workflow $UC/workflow.yaml"
    fi
else
    skip "usecases/$UC/workflow.yaml"
fi

# 3. JDM rule lint — extract rule paths from reasons.yaml
echo ""
echo "[3/5] JDM rule lint"
RULES=$(python3 - "$REASONS" <<'EOF'
import sys, yaml
reasons = yaml.safe_load(open(sys.argv[1]))
ops = reasons.get("operations", [])
for op in ops:
    if op.get("kind") == "jdm-rule":
        print(op.get("path", ""))
EOF
)
if [[ -z "$RULES" ]]; then
    skip "no jdm-rule operations in reasons.yaml"
else
    any_rule_fail=0
    while IFS= read -r rule_path; do
        full_path="$REPO_ROOT/$rule_path"
        if [[ -f "$full_path" ]]; then
            if bash "$REPO_ROOT/scripts/jdm_lint.sh" "$full_path" 2>/dev/null; then
                ok "rule $rule_path"
            else
                fail "rule $rule_path"
                any_rule_fail=1
            fi
        else
            skip "rule $rule_path (not yet built)"
        fi
    done <<< "$RULES"
fi

# 4. Python static analysis
echo ""
echo "[4/5] Python static analysis (ruff + mypy)"
for pydir in \
    "$REPO_ROOT/usecases/$UC/handler" \
    "$REPO_ROOT/usecases/$UC/agents"; do
    if [[ -d "$pydir" ]]; then
        rel="${pydir#$REPO_ROOT/}"
        if command -v ruff &>/dev/null; then
            if ruff check "$pydir" --quiet && ruff format --check "$pydir" --quiet; then
                ok "ruff $rel"
            else
                fail "ruff $rel"
            fi
        else
            skip "ruff not installed"
        fi
        if command -v mypy &>/dev/null; then
            if mypy --strict "$pydir" --quiet 2>/dev/null; then
                ok "mypy $rel"
            else
                fail "mypy $rel (type errors)"
            fi
        else
            skip "mypy not installed"
        fi
    else
        skip "$pydir (not yet built)"
    fi
done

# Also lint atomic services authored by this UC
SERVICES=$(python3 - "$REASONS" <<'EOF'
import sys, yaml
reasons = yaml.safe_load(open(sys.argv[1]))
ops = reasons.get("operations", [])
for op in ops:
    if op.get("kind") == "atomic-service":
        print(op.get("path", ""))
EOF
)
while IFS= read -r svc_path; do
    full_path="$REPO_ROOT/$svc_path"
    if [[ -d "$full_path" ]]; then
        rel="${full_path#$REPO_ROOT/}"
        if command -v ruff &>/dev/null && ruff check "$full_path" --quiet 2>/dev/null; then
            ok "ruff $rel"
        elif [[ -d "$full_path" ]]; then
            skip "ruff $rel (ruff not installed or not yet built)"
        fi
    fi
done <<< "$SERVICES"

# 5. Terraform policy check
echo ""
echo "[5/5] Terraform + OPA policy check"
TF_FILE="$REPO_ROOT/usecases/$UC/infra/$UC.tf"
if [[ -f "$TF_FILE" ]]; then
    if command -v conftest &>/dev/null; then
        if conftest test --policy "$REPO_ROOT/policies/" "$TF_FILE" 2>/dev/null; then
            ok "conftest $UC.tf"
        else
            fail "conftest $UC.tf — policy violations"
        fi
    else
        skip "conftest not installed (install: brew install conftest)"
    fi
    if command -v terraform &>/dev/null; then
        if terraform fmt -check "$TF_FILE" 2>/dev/null; then
            ok "terraform fmt $UC.tf"
        else
            fail "terraform fmt $UC.tf — run: terraform fmt infra/"
        fi
    else
        skip "terraform not installed"
    fi
else
    skip "usecases/$UC/infra/$UC.tf (not yet built)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
