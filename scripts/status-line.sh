#!/usr/bin/env bash
# scripts/status-line.sh — emits a one-line status for the Claude Code status line.
#
# Wired via .claude/settings.json:
#   { "statusLine": { "type": "command", "command": "bash scripts/status-line.sh" } }
#
# Output shape:  🏦 <usecase> · <phase> · <N services>
# Falls back to: 🏦 platform · framework

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0

# Active use case = git branch name if it matches a usecases/ directory,
# otherwise most-recently-modified directory under usecases/.
UC=""
if [ -d "usecases" ]; then
    BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
    if [ -n "$BRANCH" ] && [ -d "usecases/$BRANCH" ]; then
        UC="$BRANCH"
    else
        UC="$(ls -td usecases/*/ 2>/dev/null | head -1 | xargs -I{} basename {} 2>/dev/null || echo '')"
    fi
fi

# Phase from portfolio.yaml if present
PHASE=""
if [ -n "$UC" ] && [ -f "portfolio.yaml" ]; then
    PHASE="$(grep -A 3 "id: $UC" portfolio.yaml 2>/dev/null \
              | grep -m1 'phase:' \
              | sed 's/.*phase:[[:space:]]*//' \
              | awk '{print $1}' \
              | tr -d '\"' || echo '')"
fi

# Service count
SVC_COUNT=0
if [ -d "services/atomic" ]; then
    SVC_COUNT="$(find services/atomic -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | xargs)"
fi

# Render
if [ -n "$UC" ]; then
    if [ -n "$PHASE" ]; then
        printf "🏦 %s · %s · %s services" "$UC" "$PHASE" "$SVC_COUNT"
    else
        printf "🏦 %s · %s services" "$UC" "$SVC_COUNT"
    fi
else
    printf "🏦 platform · framework · %s services" "$SVC_COUNT"
fi
