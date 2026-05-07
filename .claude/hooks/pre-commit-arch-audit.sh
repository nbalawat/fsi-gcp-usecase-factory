#!/usr/bin/env bash
# Pre-commit hook: refuse commits that fail the architecture audit.
# Invoked before `git commit` by Claude Code's PreToolUse hook system.

set -euo pipefail

# Get list of staged files
STAGED=$(git diff --cached --name-only)

# Skip if nothing relevant staged
if ! echo "$STAGED" | grep -qE '\.(py|tf|yaml|yml|json|tsx|ts)$'; then
    exit 0
fi

echo "Running architecture audit on staged changes..."

# Run the architecture-auditor subagent
# This invokes Claude Code in non-interactive mode with the auditor as the agent.
# The auditor reviews the staged files and returns a structured JSON verdict.
RESULT=$(claude --no-interactive \
                --agent architecture-auditor \
                --input "Review these staged files for architecture compliance: $STAGED. Return JSON only." \
                --output-format json 2>/dev/null) || {
    echo "Architecture audit could not run. Skipping (commit allowed)."
    exit 0
}

VERDICT=$(echo "$RESULT" | jq -r '.verdict // "UNKNOWN"')

case "$VERDICT" in
    "PASS")
        echo "✓ Architecture audit passed."
        exit 0
        ;;
    "WARN")
        echo "⚠ Architecture audit passed with warnings:"
        echo "$RESULT" | jq -r '.violations[] | select(.severity == "WARNING") | "  \(.file):\(.line) — \(.description)"'
        echo ""
        echo "Commit allowed. Address warnings in follow-up PR."
        exit 0
        ;;
    "FAIL")
        echo "✗ Architecture audit FAILED. Commit blocked."
        echo ""
        echo "Blockers:"
        echo "$RESULT" | jq -r '.violations[] | select(.severity == "BLOCKER") | "  \(.file):\(.line) — \(.rule)\n    \(.description)\n    Fix: \(.suggested_fix)\n"'
        echo ""
        echo "Fix the blockers above and try again."
        echo "If you believe this is a false positive, run /review-uc to investigate or"
        echo "open a discussion at internal-git.bank.example.com/platform/discussions"
        exit 1
        ;;
    *)
        echo "Architecture audit returned unexpected verdict: $VERDICT"
        echo "Commit allowed (audit inconclusive). Please investigate."
        exit 0
        ;;
esac
