#!/usr/bin/env bash
# test_skills.sh — Layer 3: skill behavior snapshot tests
# Verifies each skill and agent definition has the expected structure and frontmatter.
# Does NOT invoke Claude — purely structural/schema checks.
#
# Usage:
#   bash scripts/test_skills.sh               # check all skills + agents
#   bash scripts/test_skills.sh fsi-build-parallel  # check one skill
#
# Exit codes: 0=pass, 1=failures found, 2=setup error
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/.claude/skills"
AGENTS_DIR="$REPO_ROOT/.claude/agents"
PASS=0
FAIL=0
WARN=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

check_skill() {
    local skill_dir="$1"
    local skill_name
    skill_name="$(basename "$skill_dir")"
    local skill_file="$skill_dir/SKILL.md"

    if [[ ! -f "$skill_file" ]]; then
        red "  FAIL [$skill_name] — SKILL.md missing"
        FAIL=$((FAIL + 1)); return
    fi

    # Required frontmatter fields (all skills need name + description)
    for field in "name:" "description:"; do
        if ! grep -q "^$field" "$skill_file"; then
            red "  FAIL [$skill_name] — frontmatter missing: $field"
            FAIL=$((FAIL + 1)); return
        fi
    done

    # Slash-command skills must also declare disable-model-invocation + allowed-tools
    # Auto-invoked skills (description contains "Auto-invoked") are exempt
    local desc_line
    desc_line=$(grep "^description:" "$skill_file" | head -1)
    if ! echo "$desc_line" | grep -q "Auto-invoked"; then
        for field in "disable-model-invocation:" "allowed-tools:"; do
            if ! grep -q "^$field" "$skill_file"; then
                yellow "  WARN [$skill_name] — slash-command skill missing: $field"
                WARN=$((WARN + 1))
            fi
        done
    fi

    # Description length ≤30 words
    local desc
    desc=$(grep "^description:" "$skill_file" | sed 's/^description: *//')
    local word_count
    word_count=$(echo "$desc" | wc -w | tr -d ' ')
    if [[ "$word_count" -gt 30 ]]; then
        yellow "  WARN [$skill_name] — description $word_count words (target ≤30)"
        WARN=$((WARN + 1))
    fi

    # Body length
    local total_lines
    total_lines=$(wc -l < "$skill_file" | tr -d ' ')
    local has_exception
    has_exception=$(grep -c "EXCEPTION:" "$skill_file" 2>/dev/null || true)

    if [[ "$total_lines" -gt 250 ]] && [[ "$has_exception" -eq 0 ]]; then
        red "  FAIL [$skill_name] — $total_lines lines, >250 and no EXCEPTION marker"
        FAIL=$((FAIL + 1)); return
    elif [[ "$total_lines" -gt 200 ]] && [[ "$has_exception" -eq 0 ]]; then
        yellow "  WARN [$skill_name] — $total_lines lines (target ≤200)"
        WARN=$((WARN + 1))
    fi

    green "  PASS [$skill_name] — $total_lines lines"
    PASS=$((PASS + 1))
}

check_agent() {
    local agent_file="$1"
    local agent_name
    agent_name="$(basename "$agent_file" .md)"

    for field in "name:" "description:" "tools:"; do
        if ! grep -q "^$field" "$agent_file"; then
            red "  FAIL [agent:$agent_name] — frontmatter missing: $field"
            FAIL=$((FAIL + 1)); return
        fi
    done

    local total_lines
    total_lines=$(wc -l < "$agent_file" | tr -d ' ')
    green "  PASS [agent:$agent_name] — $total_lines lines"
    PASS=$((PASS + 1))
}

echo "=== Skill behavior checks ==="
echo ""

if [[ $# -gt 0 ]]; then
    target="$1"
    if [[ -d "$SKILLS_DIR/$target" ]]; then
        check_skill "$SKILLS_DIR/$target"
    elif [[ -f "$AGENTS_DIR/$target.md" ]]; then
        check_agent "$AGENTS_DIR/$target.md"
    else
        red "ERROR: $target not found in skills/ or agents/"
        exit 2
    fi
else
    echo "Skills:"
    for skill_dir in "$SKILLS_DIR"/*/; do
        [[ -d "$skill_dir" ]] || continue
        check_skill "$skill_dir"
    done

    echo ""
    echo "Agents:"
    for agent_file in "$AGENTS_DIR"/*.md; do
        [[ -f "$agent_file" ]] || continue
        check_agent "$agent_file"
    done
fi

echo ""
echo "Results: $PASS passed, $WARN warned, $FAIL failed"

[[ "$FAIL" -eq 0 ]]
