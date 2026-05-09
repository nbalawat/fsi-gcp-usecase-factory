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

# UI smoke gate — runs only when UI files changed AND the dev server is up.
# Skipped silently if the server isn't running (typical CI fallback). The
# gate's full version runs in CI on a built `next build` output.
if echo "$STAGED" | grep -qE 'ui/(apps|packages)/.*\.(tsx?|css)$'; then
    if curl -sf http://localhost:3000 -o /dev/null 2>&1; then
        echo "Running UI smoke (docs/methodology/ui-standards.md)…"
        if ! node scripts/test_ui_smoke.mjs --no-server; then
            echo ""
            echo "✗ UI smoke FAILED. Commit blocked."
            echo "  Fix the violations above per docs/methodology/ui-standards.md."
            exit 1
        fi
    fi
fi

# Architecture-boundary gate (Track A of memo-render plan):
# any UC-specific React/lib file leaking into ui/apps/<console>/.
if echo "$STAGED" | grep -qE 'ui/apps/.*\.(tsx?|js)$'; then
    if ! node scripts/lint_uc_in_console.mjs; then
        echo ""
        echo "✗ uc-in-console gate FAILED. Commit blocked."
        echo "  Move use-case-specific code to usecases/<uc>/ui/."
        exit 1
    fi
fi

# Render-cleanliness gate (rules 8/9/10 from product-build-discipline.md):
# json-in-prose / truncation on banker-readable fields. Runs against the
# orchestrator + handler + agents whenever any of those Python files
# changed. Catches the bug class that produced the "JSON appearing in the
# memo body" incident.
if echo "$STAGED" | grep -qE '(services/orchestrator-|usecases/.*/(agents|handler))/.*\.py$'; then
    for uc in usecases/*/; do
        if [ -f "${uc}reasons.yaml" ]; then
            if ! python3 scripts/lint_no_json_in_prose.py "$uc"; then
                echo ""
                echo "✗ rule 8/9/10 (no json-in-prose) FAILED for ${uc}. Commit blocked."
                echo "  See docs/methodology/product-build-discipline.md rules 8, 9, 10."
                exit 1
            fi
        fi
    done
fi

# Lessons-doc self-test — every rule must have a CI gate paragraph.
if echo "$STAGED" | grep -qE 'docs/methodology/product-build-discipline\.md'; then
    if ! python3 scripts/lint_lessons_have_gates.py docs/methodology/product-build-discipline.md; then
        echo ""
        echo "✗ lessons-doc self-test FAILED. Commit blocked."
        exit 1
    fi
fi

# Render-stability gate (Track B of memo-render plan): runs only when the
# dev server is up + UI files changed. Walks every active case and asserts
# no glitch patterns leak to the rendered HTML.
if echo "$STAGED" | grep -qE 'ui/(apps|packages)/.*\.(tsx?|css)$|usecases/.*/ui/.*\.(tsx?|css)$'; then
    if curl -sf http://localhost:3000/api/cases?limit=1 -o /dev/null 2>&1; then
        echo "Running render-stability gate…"
        if ! node scripts/test_memo_render_stability.mjs 2>&1 | tail -5; then
            echo ""
            echo "✗ Render-stability FAILED. Commit blocked."
            echo "  See docs/methodology/ui-standards.md §4.10 + plan Track B."
            exit 1
        fi
    fi
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
