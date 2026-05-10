#!/usr/bin/env bash
# scripts/test_fsi_onboard.sh
#
# Smoke test for /fsi-onboard's hard-gate behaviour. Runs the reuse-rate gate
# against three canned canvases and asserts the expected exit codes.
#
# Used by:
#   - `make test-all` (deterministic tier — no LLM, no GCP, runs offline)
#   - the pre-commit hook when scripts/check_reuse_rate.mjs or
#     .claude/skills/fsi-onboard/SKILL.md change.
#
# Adds a fourth assertion: every required skill / schema / fixture / script
# the journey depends on actually exists at the documented path. This catches
# the "renamed but missed a reference" class of bug.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="$REPO/scripts/test_fixtures"
GATE="$REPO/scripts/check_reuse_rate.mjs"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

failed=0

assert_exit() {
  local fixture="$1" expected="$2" label="$3"
  local out
  if out=$(node "$GATE" "$fixture" 2>&1); then
    actual=0
  else
    actual=$?
  fi
  if [[ "$actual" == "$expected" ]]; then
    green "  ✓ $label  (exit=$actual)"
  else
    red   "  ✗ $label  (expected exit=$expected, got $actual)"
    echo "$out" | sed 's/^/      /'
    failed=$((failed + 1))
  fi
}

assert_path() {
  local p="$1" label="$2"
  if [[ -e "$REPO/$p" ]]; then
    green "  ✓ $label  ($p)"
  else
    red   "  ✗ $label  (missing: $p)"
    failed=$((failed + 1))
  fi
}

# Some agent archetypes name their manifest archetype.yaml, others manifest.yaml.
# Asserts the agent dir exists AND at least one of the two manifest names.
assert_agent_archetype() {
  local name="$1"
  local dir="libraries/agents/$name"
  if [[ -d "$REPO/$dir" ]] && { [[ -f "$REPO/$dir/manifest.yaml" ]] || [[ -f "$REPO/$dir/archetype.yaml" ]]; }; then
    green "  ✓ $name agent archetype  ($dir/{manifest,archetype}.yaml)"
  else
    red   "  ✗ $name agent archetype  (missing manifest at $dir)"
    failed=$((failed + 1))
  fi
}

assert_summary_field() {
  local fixture="$1" field="$2" expected="$3" label="$4"
  local stderr
  stderr=$(node "$GATE" "$fixture" 2>&1 1>/dev/null || true)
  local actual
  actual=$(echo "$stderr" | python3 -c "import sys, json; v=json.loads(sys.stdin.read().splitlines()[-1])['$field']; print(str(v).lower() if isinstance(v, bool) else v)" 2>/dev/null || echo "<parse_error>")
  if [[ "$actual" == "$expected" ]]; then
    green "  ✓ $label  ($field=$actual)"
  else
    red   "  ✗ $label  (expected $field=$expected, got $actual)"
    failed=$((failed + 1))
  fi
}

echo "─── Smoke test: /fsi-onboard ─────────────────────────────"
echo

echo "1. Reuse-rate gate (exit-code semantics):"
assert_exit "$FIXTURES/onboarding_mortgage_good.yaml"      0 "good fixture passes"
assert_exit "$FIXTURES/onboarding_proliferation_bad.yaml"  1 "proliferation fixture blocked"
assert_exit "$FIXTURES/onboarding_overridden.yaml"         0 "overridden fixture passes (logged)"
echo

echo "2. Machine-readable summary on stderr:"
assert_summary_field "$FIXTURES/onboarding_mortgage_good.yaml"     gate_passed true  "good summary marks pass"
assert_summary_field "$FIXTURES/onboarding_proliferation_bad.yaml" gate_passed false "bad summary marks fail"
assert_summary_field "$FIXTURES/onboarding_overridden.yaml"        overridden  true  "overridden summary marks override"
echo

echo "3. Required journey artifacts exist:"
assert_path ".claude/skills/fsi-onboard/SKILL.md"           "skill prompt present"
assert_path ".claude/schemas/onboarding.schema.yaml"         "canvas schema present"
assert_path "scripts/check_reuse_rate.mjs"                   "reuse gate present"
assert_path "scripts/test_fixtures/onboarding_mortgage_good.yaml" "good fixture present"
assert_path "scripts/test_fixtures/onboarding_proliferation_bad.yaml" "bad fixture present"
assert_path "scripts/test_fixtures/onboarding_overridden.yaml" "override fixture present"
echo

echo "4. Library shapes referenced by /fsi-onboard exist:"
# Anything the skill names as a default option must exist on disk so the
# journey doesn't recommend ghost shapes.
assert_path "libraries/use-cases/pipeline-originator/archetype.yaml"             "pipeline-originator archetype"
assert_path "libraries/patterns/extractor-spreader-rater-drafter/pattern.yaml"   "extractor-spreader-rater-drafter pattern"
assert_agent_archetype "document-processor"
assert_agent_archetype "analyst-multisection"
assert_agent_archetype "rater-with-covenant"
assert_agent_archetype "narrative-drafter"
assert_agent_archetype "memo-reviewer-v2"
assert_path "services/atomic/financial-spreader/manifest.json"                   "financial-spreader service"
assert_path "services/atomic/loan-serviceability/manifest.json"                  "loan-serviceability service"
assert_path "services/atomic/peer-and-industry-context/manifest.json"            "peer-and-industry-context service"
assert_path "services/atomic/borrower-network/manifest.json"                     "borrower-network service"
assert_path "services/atomic/document-extractor/manifest.json"                   "document-extractor service"
echo

echo "5. Skill cross-references resolvable:"
# The skill points readers at these docs; if they get renamed, the journey
# guidance evaporates.
assert_path "docs/methodology/factory-cookbook.md"                               "cookbook present"
assert_path "docs/methodology/product-build-discipline.md"                       "discipline rules present"
assert_path "docs/methodology/onboard-new-use-case.md"                           "onboarding runbook present"
assert_path "docs/methodology/console_reference.md"                              "console reference present"
assert_path "docs/methodology/model-prerequisites.md"                            "model prereq matrix present"
echo

if [[ $failed -gt 0 ]]; then
  red "$failed assertion(s) failed."
  exit 1
fi
green "All assertions passed."
