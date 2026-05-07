#!/usr/bin/env bash
# lint_toolkit.sh — fast, fail-fast lint of skills, agents, hooks, policies.
# Target: <30s on the full toolkit. Run by CI on every PR touching .claude/.

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_ROOT"

PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then
    echo "ERROR: python3 not found." >&2
    exit 2
fi

FAILED=0
WARNED=0

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }

fail() { red "FAIL: $*"; FAILED=$((FAILED + 1)); }
warn() { yellow "WARN: $*"; WARNED=$((WARNED + 1)); }
pass() { green "PASS: $*"; }

# ─────────────────────────────────────────────────────────────────────
# 1. Skills: frontmatter, description length, body length, body shape
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── Skills ────────────────────────────────────────────────────"

if [ -d ".claude/skills" ]; then
    for skill_dir in .claude/skills/*/; do
        skill=$(basename "$skill_dir")
        skill_md="${skill_dir}SKILL.md"
        if [ ! -f "$skill_md" ]; then
            fail "$skill — missing SKILL.md"
            continue
        fi

        # Run a single Python pass over the file
        result=$("$PY" - "$skill_md" "$skill" <<'PY'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
expected_name = sys.argv[2]
text = path.read_text()
issues = []

# Frontmatter
m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
if not m:
    print("FAIL:no-frontmatter")
    sys.exit(0)
fm = m.group(1)
body = text[m.end():]

# name
nm = re.search(r"^name:\s*(.+?)$", fm, re.M)
if not nm:
    issues.append("FAIL:no-name")
else:
    name = nm.group(1).strip()
    if name != expected_name:
        issues.append(f"FAIL:name-mismatch({name}!={expected_name})")

# description
dm = re.search(r"^description:\s*(.+?)$", fm, re.M)
if not dm:
    issues.append("FAIL:no-description")
else:
    desc = dm.group(1).strip()
    word_count = len(desc.split())
    if word_count > 50:
        issues.append(f"FAIL:description-too-long({word_count}-words)")
    elif word_count > 30:
        issues.append(f"WARN:description-long({word_count}-words)")

# Body length — respects <!-- EXCEPTION: <reason> --> markers in first 30 body lines
exception_marker = re.search(r"<!--\s*EXCEPTION:\s*(.+?)\s*-->", "\n".join(body.splitlines()[:30]))
body_lines = body.count("\n")
if body_lines > 250:
    if exception_marker:
        issues.append(f"WARN:body-{body_lines}-lines(EXCEPTION:{exception_marker.group(1)[:60]})")
    else:
        issues.append(f"FAIL:body-{body_lines}-lines(limit-200)")
elif body_lines > 200:
    issues.append(f"WARN:body-{body_lines}-lines(prefer-150)")
elif body_lines > 150:
    issues.append(f"WARN:body-{body_lines}-lines(prefer-150)")

# Shape: A (## Step) or B (≥3 named ## sections)
has_steps = bool(re.search(r"^## Step \d", body, re.M))
section_count = len(re.findall(r"^## ", body, re.M))
if not has_steps and section_count < 3:
    issues.append("WARN:body-shape-unclear(no-steps,few-sections)")

print("\n".join(issues) if issues else "OK")
PY
)

        case "$result" in
            OK) pass "$skill" ;;
            *)
                while IFS= read -r line; do
                    case "$line" in
                        FAIL:*) fail "$skill — ${line#FAIL:}" ;;
                        WARN:*) warn "$skill — ${line#WARN:}" ;;
                    esac
                done <<< "$result"
                ;;
        esac
    done
else
    warn "no .claude/skills/ directory"
fi

# ─────────────────────────────────────────────────────────────────────
# 2. Agents: frontmatter (name, description, tools)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── Agents ────────────────────────────────────────────────────"

if [ -d ".claude/agents" ]; then
    for agent_md in .claude/agents/*.md; do
        [ -f "$agent_md" ] || continue
        agent=$(basename "$agent_md" .md)
        result=$("$PY" - "$agent_md" "$agent" <<'PY'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
expected_name = sys.argv[2]
text = path.read_text()
m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
if not m:
    print("FAIL:no-frontmatter"); sys.exit(0)
fm = m.group(1)
issues = []
nm = re.search(r"^name:\s*(.+?)$", fm, re.M)
if not nm: issues.append("FAIL:no-name")
elif nm.group(1).strip() != expected_name:
    issues.append(f"FAIL:name-mismatch({nm.group(1).strip()}!={expected_name})")
if not re.search(r"^description:\s*", fm, re.M):
    issues.append("FAIL:no-description")
print("\n".join(issues) if issues else "OK")
PY
)
        case "$result" in
            OK) pass "$agent" ;;
            *)
                while IFS= read -r line; do
                    case "$line" in
                        FAIL:*) fail "agents/$agent — ${line#FAIL:}" ;;
                        WARN:*) warn "agents/$agent — ${line#WARN:}" ;;
                    esac
                done <<< "$result"
                ;;
        esac
    done
else
    warn "no .claude/agents/ directory"
fi

# ─────────────────────────────────────────────────────────────────────
# 3. Hooks: bash syntax + shellcheck (if available)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── Hooks ─────────────────────────────────────────────────────"

if [ -d ".claude/hooks" ]; then
    for hook_sh in .claude/hooks/*.sh; do
        [ -f "$hook_sh" ] || continue
        hook=$(basename "$hook_sh")
        if ! bash -n "$hook_sh" 2>/dev/null; then
            fail "$hook — bash syntax error"
            continue
        fi
        if command -v shellcheck >/dev/null 2>&1; then
            if ! shellcheck -e SC2181,SC2155 "$hook_sh" >/dev/null 2>&1; then
                warn "$hook — shellcheck issues (run \`shellcheck $hook_sh\` for details)"
            else
                pass "$hook"
            fi
        else
            pass "$hook (syntax ok; install shellcheck for deeper lint)"
        fi
    done
else
    warn "no .claude/hooks/ directory"
fi

# ─────────────────────────────────────────────────────────────────────
# 4. Policies: JSON validity
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "── Policies ──────────────────────────────────────────────────"

if [ -d "policies" ]; then
    for json_file in policies/*.json; do
        [ -f "$json_file" ] || continue
        name=$(basename "$json_file")
        if "$PY" -c "import json,sys; json.load(open('$json_file'))" 2>/dev/null; then
            pass "$name"
        else
            fail "$name — invalid JSON"
        fi
    done
else
    warn "no policies/ directory"
fi

# ─────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────────────────────"
if [ "$FAILED" -gt 0 ]; then
    red   "Lint FAILED: $FAILED failures, $WARNED warnings."
    exit 1
elif [ "$WARNED" -gt 0 ]; then
    yellow "Lint passed with $WARNED warnings."
    exit 0
else
    green "Lint clean."
    exit 0
fi
