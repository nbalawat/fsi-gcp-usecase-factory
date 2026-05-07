#!/usr/bin/env bash
# Session start hook — banner with active use case, REASONS-aware context, portfolio link.
#
# Two repo modes:
#   monorepo       — many use cases under usecases/<id>/, plus portfolio.yaml at root
#   per-use-case   — single use case, scaffolded by /init-use-case in its own repo

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_ROOT" || exit 0

# Detect repo mode
MODE="unknown"
if [ -f "portfolio.yaml" ] && [ -d "usecases" ]; then
    MODE="monorepo"
elif [ -f "reasons.yaml" ] || [ -d "docs/use_cases" ]; then
    MODE="per-use-case"
fi

# Identify active use case
UC_ID=""
UC_PHASE=""
UC_CONSOLE=""
UC_REGULATORY=""
UC_REASONS_PATH=""

if [ "$MODE" = "monorepo" ]; then
    # Active UC = git branch name if it matches a usecases/ directory, else most-recently-modified UC
    BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ -n "$BRANCH" ] && [ -d "usecases/$BRANCH" ]; then
        UC_ID="$BRANCH"
    else
        UC_ID=$(ls -td usecases/*/ 2>/dev/null | head -1 | xargs -I{} basename {} || echo "")
    fi
    [ -n "$UC_ID" ] && UC_REASONS_PATH="usecases/$UC_ID/reasons.yaml"
elif [ "$MODE" = "per-use-case" ]; then
    UC_ID=$(basename "$PROJECT_ROOT")
    [ -f "reasons.yaml" ] && UC_REASONS_PATH="reasons.yaml"
fi

# Pull facts from REASONS if present (yq is preferred; fall back to grep)
if [ -n "$UC_REASONS_PATH" ] && [ -f "$UC_REASONS_PATH" ]; then
    if command -v yq >/dev/null 2>&1; then
        UC_PHASE=$(yq -r '.phase // ""' "$UC_REASONS_PATH" 2>/dev/null || echo "")
        UC_CONSOLE=$(yq -r '.structure.console_pattern // ""' "$UC_REASONS_PATH" 2>/dev/null || echo "")
        UC_REGULATORY=$(yq -r '.requirements.regulatory_regime[]' "$UC_REASONS_PATH" 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo "")
    else
        UC_PHASE=$(grep -E '^phase:' "$UC_REASONS_PATH" 2>/dev/null | sed 's/phase: *//' | tr -d '"' | head -1 || echo "")
        UC_CONSOLE=$(grep -E '^\s*console_pattern:' "$UC_REASONS_PATH" 2>/dev/null | sed 's/.*console_pattern: *//' | tr -d '"' | head -1 || echo "")
    fi
fi

# Service count for status line
SVC_COUNT=0
if [ -d "services/atomic" ]; then
    SVC_COUNT=$(find services/atomic -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | xargs || echo 0)
fi

# Portfolio rollup (monorepo only)
PORTFOLIO_LINE=""
if [ "$MODE" = "monorepo" ] && [ -f "portfolio.yaml" ]; then
    if command -v yq >/dev/null 2>&1; then
        UC_TOTAL=$(yq -r '.use_cases | length' portfolio.yaml 2>/dev/null || echo 0)
        UC_PROMOTED=$(yq -r '[.use_cases[] | select(.phase == "promoted")] | length' portfolio.yaml 2>/dev/null || echo 0)
        UC_PILOTING=$(yq -r '[.use_cases[] | select(.phase == "piloting")] | length' portfolio.yaml 2>/dev/null || echo 0)
        PORTFOLIO_LINE="Portfolio: ${UC_TOTAL} total · ${UC_PROMOTED} promoted · ${UC_PILOTING} piloting"
    fi
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  🏦  Agentic banking platform · ${MODE}"
echo "═══════════════════════════════════════════════════════════════"

if [ -n "$UC_ID" ]; then
    printf "  Active use case:  %s\n" "$UC_ID"
    [ -n "$UC_PHASE" ]      && printf "  Phase:            %s\n" "$UC_PHASE"
    [ -n "$UC_CONSOLE" ]    && printf "  Console:          %s\n" "$UC_CONSOLE"
    [ -n "$UC_REGULATORY" ] && printf "  Regulatory:       %s\n" "$UC_REGULATORY"
    [ -n "$UC_REASONS_PATH" ] && printf "  REASONS canvas:   %s\n" "$UC_REASONS_PATH"
else
    echo "  No active use case detected."
    echo "  Run /init-use-case \"<name>\" to start one."
fi

printf "  Atomic services:  %s in services/atomic/\n" "$SVC_COUNT"
[ -n "$PORTFOLIO_LINE" ] && printf "  %s\n" "$PORTFOLIO_LINE"

echo ""
echo "  Frequent commands:"
echo "    /fsi-portfolio       — registry view across all use cases"
echo "    /fsi-reasons-canvas  — author or update reasons.yaml"
echo "    /init-use-case       — bootstrap a new use case"
echo "    /new-use-case        — scaffold end-to-end"
echo "    /fsi-build-parallel  — fan-out builders for the credit-memo DAG"
echo "    /review-uc           — full review (run before commit)"
echo "    /promote             — promotion gate"
echo ""
echo "  Pre-commit hook runs architecture-auditor; bad commits are blocked."
echo "═══════════════════════════════════════════════════════════════"
echo ""
