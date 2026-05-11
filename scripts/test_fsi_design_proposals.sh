#!/usr/bin/env bash
# scripts/test_fsi_design_proposals.sh
#
# Deterministic smoke for the UX-first lockdown machinery. Verifies
# every static piece /fsi-design-proposals + /fsi-design-review depend
# on without spawning agents or touching GCP.
#
#   1. Schemas exist and parse as YAML
#   2. Mock-data generator produces a deterministic, importable .ts module
#      from the mortgage-origination fixture canvas
#   3. The generated TS contains all required exports
#   4. The Cloud Build template references all expected substitutions
#   5. The cleanup script's --help works and bash -n is clean
#   6. The skills exist with valid frontmatter
#   7. The auditor's UX-first rules are present
#   8. The init-use-case Step 0 preflight is wired
#   9. /fsi-onboard's Step 10 handoff points at /fsi-design-proposals
#  10. Comparator HTML builder runs against synthesized inputs and emits
#      a self-contained, file:// safe HTML page
#
# Used by `make test-all` and the pre-commit hook when any UX-first
# machinery file changes. Runs in <10 seconds, fully offline.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
dim()    { printf "\033[2m%s\033[0m\n" "$*"; }

failed=0

assert_path() {
  local p="$1" label="$2"
  if [[ -e "$REPO/$p" ]]; then
    green "  ✓ $label  ($p)"
  else
    red   "  ✗ $label  (missing: $p)"
    failed=$((failed + 1))
  fi
}

assert_grep() {
  local pattern="$1" file="$2" label="$3"
  if grep -qE -- "$pattern" "$REPO/$file" 2>/dev/null; then
    green "  ✓ $label"
  else
    red   "  ✗ $label  (pattern '$pattern' not in $file)"
    failed=$((failed + 1))
  fi
}

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$expected" == "$actual" ]]; then
    green "  ✓ $label"
  else
    red   "  ✗ $label  (expected '$expected', got '$actual')"
    failed=$((failed + 1))
  fi
}

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
  rm -rf "$REPO/usecases/__test_design_proposals__"
  rm -rf "$REPO/.fsi-state/__test_design_proposals__"
  rm -f  "$REPO/onboarding/__test_design_proposals__.yaml"
  rmdir  "$REPO/onboarding" 2>/dev/null || true
}
trap cleanup EXIT

echo "─── Smoke test: UX-first lockdown ────────────────────────"
echo

echo "1. Schemas + foundation files exist:"
assert_path ".claude/schemas/ui-decision.schema.yaml"           "ui-decision schema"
assert_path ".claude/schemas/option-manifest.schema.yaml"        "option-manifest schema"
assert_path "scripts/generate_mock_canvas_data.mjs"              "mock-data generator"
assert_path "scripts/build_design_comparator.mjs"                "comparator builder"
assert_path "scripts/cleanup_design_proposals.sh"                "cleanup script"
assert_path "infra/templates/design-proposal-cloudbuild.yaml"    "cloud build template"
assert_path ".claude/skills/fsi-design-proposals/SKILL.md"       "proposals skill"
assert_path ".claude/skills/fsi-design-review/SKILL.md"          "review skill"
assert_path "docs/methodology/ux-first-discipline.md"            "discipline doc"
echo

echo "2. Mock-data generator produces importable TS from mortgage-origination fixture:"
mkdir -p "$REPO/onboarding"
cp "$REPO/scripts/test_fixtures/onboarding_mortgage_good.yaml" "$REPO/onboarding/__test_design_proposals__.yaml"
GEN_OUT="$REPO/usecases/__test_design_proposals__/ui/proposals/_shared/mock-data.ts"
if node "$REPO/scripts/generate_mock_canvas_data.mjs" __test_design_proposals__ >/dev/null 2>&1; then
  green "  ✓ generator ran without error"
else
  red   "  ✗ generator failed"
  node "$REPO/scripts/generate_mock_canvas_data.mjs" __test_design_proposals__ 2>&1 | sed 's/^/      /'
  failed=$((failed + 1))
fi
assert_path "usecases/__test_design_proposals__/ui/proposals/_shared/mock-data.ts" "generated TS file"
echo

echo "3. Generated TS contains required exports:"
for sym in USE_CASE_ID CANVAS_SHA256 CONSOLE_PATTERN BORROWERS PRIMARY_BORROWER CASE_SHAPE HITL_GATES ATOMIC_SERVICE_STUBS AGENT_OUTPUT_STUBS PIPELINE_EVENTS LIVE_CASE; do
  assert_grep "export const $sym" "usecases/__test_design_proposals__/ui/proposals/_shared/mock-data.ts" "exports $sym"
done
echo

echo "4. Generator is deterministic (same canvas → same TS):"
sha1=$(shasum -a 256 "$GEN_OUT" | awk '{print $1}')
node "$REPO/scripts/generate_mock_canvas_data.mjs" __test_design_proposals__ >/dev/null 2>&1
sha2=$(shasum -a 256 "$GEN_OUT" | awk '{print $1}')
# generator embeds generated_at iso → bytes differ in that line; strip it
sha1=$(grep -v '^//   generated_at' "$GEN_OUT.bak" 2>/dev/null | shasum -a 256 | awk '{print $1}' || echo "first-pass")
cp "$GEN_OUT" "$GEN_OUT.bak"
node "$REPO/scripts/generate_mock_canvas_data.mjs" __test_design_proposals__ >/dev/null 2>&1
shaA=$(grep -v '^//   generated_at' "$GEN_OUT.bak" | shasum -a 256 | awk '{print $1}')
shaB=$(grep -v '^//   generated_at' "$GEN_OUT"     | shasum -a 256 | awk '{print $1}')
assert_eq "$shaA" "$shaB" "ignoring generated_at, output is byte-identical"
rm -f "$GEN_OUT.bak"
echo

echo "5. Cloud Build template has expected substitutions:"
assert_grep "_USE_CASE:" "infra/templates/design-proposal-cloudbuild.yaml"  "_USE_CASE substitution declared"
assert_grep "_OPTION:"   "infra/templates/design-proposal-cloudbuild.yaml"  "_OPTION substitution declared"
assert_grep "fsi-uc-.*-design-" "infra/templates/design-proposal-cloudbuild.yaml" "service-name pattern present"
assert_grep "kind=design-proposal" "infra/templates/design-proposal-cloudbuild.yaml" "kind=design-proposal label present (cleanup script greps for this)"
echo

echo "6. Cleanup script is bash-clean and self-documenting:"
if bash -n "$REPO/scripts/cleanup_design_proposals.sh" 2>/dev/null; then
  green "  ✓ bash -n clean"
else
  red   "  ✗ bash -n failed"
  failed=$((failed + 1))
fi
if "$REPO/scripts/cleanup_design_proposals.sh" --help >/dev/null 2>&1; then
  green "  ✓ --help works"
else
  red   "  ✗ --help failed"
  failed=$((failed + 1))
fi
echo

echo "7. Skill frontmatter is valid:"
assert_grep "^name: fsi-design-proposals" ".claude/skills/fsi-design-proposals/SKILL.md" "fsi-design-proposals name"
assert_grep "^name: fsi-design-review"     ".claude/skills/fsi-design-review/SKILL.md"     "fsi-design-review name"
assert_grep "disable-model-invocation: true" ".claude/skills/fsi-design-proposals/SKILL.md" "fsi-design-proposals disable-model-invocation"
assert_grep "disable-model-invocation: true" ".claude/skills/fsi-design-review/SKILL.md"     "fsi-design-review disable-model-invocation"
echo

echo "8. Auditor's UX-first checks are wired:"
assert_grep "UX-first design contract" ".claude/agents/architecture-auditor.md"  "UX-first section present"
assert_grep "decision.yaml"             ".claude/agents/architecture-auditor.md"  "auditor cites decision.yaml"
assert_grep "archives/design"           ".claude/agents/architecture-auditor.md"  "auditor cites top-level archive trail"
assert_grep "lock_level"                ".claude/agents/architecture-auditor.md"  "auditor enforces lock_level"
echo

echo "8b. archives/ directory present + documented:"
assert_path "archives/README.md"                                                 "archives/README.md present"
assert_path "archives/design/.gitkeep"                                           "archives/design/ committed"
echo

echo "9. /init-use-case Step 0 preflight is wired:"
assert_grep "UX-first preflight" ".claude/skills/init-use-case/SKILL.md" "Step 0 named"
assert_grep "decision.yaml"      ".claude/skills/init-use-case/SKILL.md" "Step 0 references decision.yaml"
assert_grep "skip-design"        ".claude/skills/init-use-case/SKILL.md" "Step 0 documents --skip-design escape"
echo

echo "10. /fsi-onboard handoff points at /fsi-design-proposals:"
assert_grep "/fsi-design-proposals" ".claude/skills/fsi-onboard/SKILL.md" "handoff cites /fsi-design-proposals"
assert_grep "/fsi-design-review"    ".claude/skills/fsi-onboard/SKILL.md" "handoff cites /fsi-design-review"
echo

echo "11. Comparator builder produces a self-contained HTML page:"
# Set up minimal proposal directories so the comparator has something to render.
PROP_DIR="$REPO/usecases/__test_design_proposals__/ui/proposals"
mkdir -p "$PROP_DIR/option-a" "$PROP_DIR/option-b" "$PROP_DIR/option-c" "$PROP_DIR/option-d"
mkdir -p "$REPO/.fsi-state/__test_design_proposals__/proposals"
cat > "$REPO/.fsi-state/__test_design_proposals__/proposals/preflight.json" <<EOF
{"use_case_id":"__test_design_proposals__","canvas_sha256":"abc1234567890def","options_planned":["a","b","c","d"]}
EOF
for opt in a b c d; do
  axis="density"
  [[ "$opt" == "b" ]] && axis="metaphor"
  [[ "$opt" == "c" ]] && axis="affordance"
  [[ "$opt" == "d" ]] && axis="wildcard"
  OPT_UP=$(printf "%s" "$opt" | tr '[:lower:]' '[:upper:]')
  # Per-option a11y violation count so the comparator can render both states.
  a11y_count=4
  a11y_mode="static-heuristic"
  [[ "$opt" == "a" ]] && a11y_count=3
  [[ "$opt" == "b" ]] && a11y_count=8 && a11y_mode="pa11y-live"
  cat > "$PROP_DIR/option-$opt/manifest.yaml" <<MFEOF
schema_version: "1.0.0"
option: $OPT_UP
variation_axis: $axis
canvas_checksum: abc1234567890def
use_case_id: __test_design_proposals__
persona:
  primary: Test Persona
  context: smoke-test
density_score: 3
motion_budget: standard
affordance_pattern: sticky-bottom-bar
primary_metaphor: workflow-first
components_used: []
routes_implemented:
  - case-detail
  - approval-flow
design_summary: Smoke test option for $axis variation. Exists only so the comparator has data to render.
tradeoffs:
  optimised_for:
    - testability
  sacrifices:
    - realism
hero_screenshot: hero.png
build:
  build_succeeded: true
  deploy_succeeded: false
  a11y_violations: $a11y_count
  a11y_scan_mode: "$a11y_mode"
MFEOF
done

if node "$REPO/scripts/build_design_comparator.mjs" __test_design_proposals__ >/dev/null 2>&1; then
  green "  ✓ comparator builder ran"
else
  red   "  ✗ comparator builder failed"
  node "$REPO/scripts/build_design_comparator.mjs" __test_design_proposals__ 2>&1 | sed 's/^/      /'
  failed=$((failed + 1))
fi
HTML="$REPO/usecases/__test_design_proposals__/ui/proposals/_review.html"
assert_path "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator HTML"
assert_grep "<!doctype html>"           "usecases/__test_design_proposals__/ui/proposals/_review.html" "valid HTML doctype"
assert_grep "Option A"                  "usecases/__test_design_proposals__/ui/proposals/_review.html" "renders option A"
assert_grep "Option D"                  "usecases/__test_design_proposals__/ui/proposals/_review.html" "renders option D"
assert_grep "deploy failed"             "usecases/__test_design_proposals__/ui/proposals/_review.html" "shows ⚠ banner for failed deploys"
echo

echo "12. Judge pass artifacts (Phase 0.1) are wired:"
assert_path ".claude/skills/fsi-design-proposals/assets/judge-prompt.md"  "judge prompt template present"
assert_grep "Stage 2.5 — Judge pass" ".claude/skills/fsi-design-proposals/SKILL.md" "Stage 2.5 named in skill"
assert_grep "judge-report.json"      ".claude/skills/fsi-design-proposals/SKILL.md" "skill cites judge-report.json"
assert_grep "judge:"                  ".claude/schemas/option-manifest.schema.yaml" "option manifest schema has judge field"
echo

echo "12c. A11y gate (Phase 0.2) wired:"
assert_path "scripts/check_a11y_per_option.mjs"                                 "a11y check script present"
assert_grep "Stage 3.5 — a11y scan"      ".claude/skills/fsi-design-proposals/SKILL.md" "Stage 3.5 named in skill"
assert_grep "check_a11y_per_option.mjs"  ".claude/skills/fsi-design-proposals/SKILL.md" "skill calls the a11y script"
# bash -n equivalent for node — syntax check
if node --check "$REPO/scripts/check_a11y_per_option.mjs" 2>/dev/null; then
  green "  ✓ a11y script parses"
else
  red   "  ✗ a11y script has syntax error"
  failed=$((failed + 1))
fi
# a11y static heuristic finds violations in a known-bad fixture
A11Y_TEST_REPO="$(mktemp -d)/a11y-test-repo"
mkdir -p "$A11Y_TEST_REPO/scripts" "$A11Y_TEST_REPO/usecases/myuc/ui/proposals/option-a/app"
cp "$REPO/scripts/check_a11y_per_option.mjs" "$A11Y_TEST_REPO/scripts/"
cat > "$A11Y_TEST_REPO/usecases/myuc/ui/proposals/option-a/manifest.yaml" <<MFEOF
schema_version: "1.0.0"
option: A
MFEOF
cat > "$A11Y_TEST_REPO/usecases/myuc/ui/proposals/option-a/app/page.tsx" <<TSXEOF
export default function P() {
  return (
    <div>
      <img src="/x.png" />
      <div onClick={() => 1}>click</div>
      <button><svg /></button>
      <a>link</a>
    </div>
  );
}
TSXEOF
(cd "$A11Y_TEST_REPO" && node scripts/check_a11y_per_option.mjs myuc --static >/dev/null 2>&1)
if grep -q "a11y_violations: 4" "$A11Y_TEST_REPO/usecases/myuc/ui/proposals/option-a/manifest.yaml"; then
  green "  ✓ a11y heuristic detects 4 violations in fixture (img/div/button/a)"
else
  red   "  ✗ a11y heuristic did not find expected violations"
  failed=$((failed + 1))
fi
rm -rf "$A11Y_TEST_REPO"
echo

echo "12d. Reuse-floor gate (Phase 0.3) wired:"
assert_path "scripts/check_reuse_floor.mjs"                                       "reuse-floor script present"
assert_grep "reuse-floor"          ".claude/skills/fsi-design-proposals/SKILL.md" "skill cites reuse-floor"
assert_grep "Component-reuse floor" ".claude/skills/fsi-design-proposals/SKILL.md" "skill names the floor gate"
if node --check "$REPO/scripts/check_reuse_floor.mjs" 2>/dev/null; then
  green "  ✓ reuse-floor script parses"
else
  red   "  ✗ reuse-floor script has syntax error"
  failed=$((failed + 1))
fi

# Reuse-floor gate: option-A (5 shared) passes; option-B (2 shared) fails; exit=1
RF_TEST_REPO="$(mktemp -d)"
mkdir -p "$RF_TEST_REPO/scripts" "$RF_TEST_REPO/usecases/myuc/ui/proposals/option-a" "$RF_TEST_REPO/usecases/myuc/ui/proposals/option-b"
cp "$REPO/scripts/check_reuse_floor.mjs" "$RF_TEST_REPO/scripts/"
cat > "$RF_TEST_REPO/usecases/myuc/ui/proposals/option-a/manifest.yaml" <<RFEOF
schema_version: "1.0.0"
option: A
components_used:
  - name: AppShell
    source: shared
  - name: Button
    source: shared
  - name: MetricStrip
    source: shared
  - name: Badge
    source: shared
  - name: Card
    source: shared
RFEOF
cat > "$RF_TEST_REPO/usecases/myuc/ui/proposals/option-b/manifest.yaml" <<RFEOF2
schema_version: "1.0.0"
option: B
components_used:
  - name: AppShell
    source: shared
  - name: Custom1
    source: net-new
  - name: Custom2
    source: net-new
RFEOF2
rf_exit=0
(cd "$RF_TEST_REPO" && node scripts/check_reuse_floor.mjs myuc >/dev/null 2>/dev/null) || rf_exit=$?
if [[ "$rf_exit" == "1" ]]; then
  green "  ✓ reuse-floor gate exits 1 when any option fails"
else
  red   "  ✗ reuse-floor gate did not exit 1 (got $rf_exit)"
  failed=$((failed + 1))
fi
if grep -q "reuse_floor_met: true"  "$RF_TEST_REPO/usecases/myuc/ui/proposals/option-a/manifest.yaml" && \
   grep -q "reuse_floor_met: false" "$RF_TEST_REPO/usecases/myuc/ui/proposals/option-b/manifest.yaml"; then
  green "  ✓ reuse-floor gate stamps reuse_floor_met into both manifests correctly"
else
  red   "  ✗ reuse-floor gate did not stamp manifests correctly"
  failed=$((failed + 1))
fi
rm -rf "$RF_TEST_REPO"
echo

echo "12b. Comparator renders judge row when judge fields populated:"
# Inject judge into option-a manifest, regenerate, grep
PROP_DIR_2="$REPO/usecases/__test_design_proposals__/ui/proposals"
# Append judge block to option-a's manifest (already minimal, just append)
cat >> "$PROP_DIR_2/option-a/manifest.yaml" <<JEOF
judge:
  composite_score: 4.2
  ui_standards: 4.5
  agentic_principles: 4.0
  reuse_floor_met: true
  hitl_gates_wired: true
  net_new_count: 1
  violations:
    - "smoke test injected violation"
  strengths:
    - "smoke test injected strength"
  recommended: true
  ranking_position: 1
JEOF
# (a11y fields already in the manifests created in section 11; no append needed.)
node "$REPO/scripts/build_design_comparator.mjs" __test_design_proposals__ >/dev/null 2>&1
assert_grep "judge pick"        "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator renders judge-pick badge"
assert_grep "composite 4.2"     "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator renders composite score"
assert_grep "1 violation"       "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator renders violation count"
assert_grep "a11y 3"            "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator renders a11y under-budget pill"
assert_grep "a11y 8 ⚠"          "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator renders a11y over-budget warning"

# Inject a reuse-floor failure into option-d and re-render; comparator must show the "reuse floor failed" panel.
cat >> "$PROP_DIR_2/option-d/manifest.yaml" <<RFEOF3
  reuse_floor_met: false
  reuse_count_shared: 2
RFEOF3
node "$REPO/scripts/build_design_comparator.mjs" __test_design_proposals__ >/dev/null 2>&1
assert_grep "reuse floor failed" "usecases/__test_design_proposals__/ui/proposals/_review.html" "comparator renders reuse-floor-failed panel"
echo

echo "13a. Test-run scheme (Phase 0.5):"
assert_path "archives/design-tests/README.md"     "design-tests README"
assert_path "archives/design-tests/.gitkeep"      "design-tests committed even empty"
assert_grep "Test-run archive protection" ".claude/agents/architecture-auditor.md" "auditor rule for design-tests"
assert_grep "archives/design-tests"        ".claude/agents/architecture-auditor.md" "auditor cites design-tests path"
echo

echo "13b. Seven canned canvases present + reuse-gate-passing:"
canvases=(
  "canvas-pipeline-credit-memo"
  "canvas-pipeline-mortgage"
  "canvas-investigations-sar"
  "canvas-realtime-fraud"
  "canvas-surveillance-cre"
  "canvas-run-cecl"
  "canvas-recs-nba"
)
for c in "${canvases[@]}"; do
  assert_path "scripts/test_fixtures/$c.yaml" "$c canvas"
  if node "$REPO/scripts/check_reuse_rate.mjs" "$REPO/scripts/test_fixtures/$c.yaml" >/dev/null 2>/dev/null; then
    green "  ✓ $c passes reuse-rate gate"
  else
    red   "  ✗ $c FAILS reuse-rate gate"
    failed=$((failed + 1))
  fi
done
echo

echo "13. Meta-comparator (Phase 0.4) wired:"
assert_path "scripts/build_meta_comparator.mjs"  "meta-comparator script present"
if node --check "$REPO/scripts/build_meta_comparator.mjs" 2>/dev/null; then
  green "  ✓ meta-comparator script parses"
else
  red   "  ✗ meta-comparator script has syntax error"
  failed=$((failed + 1))
fi

# End-to-end smoke: build two fixture test runs, then render the meta-comparator
MC_TS1="20260510T100000Z"
MC_TS2="20260510T110000Z"
MC_UC="__test_meta_comparator__"
MC_ROOT="$REPO/archives/design-tests"
mkdir -p "$MC_ROOT/$MC_TS1-$MC_UC-run1" "$MC_ROOT/$MC_TS2-$MC_UC-run2"

# Each run has 4 options (a/b/c/d). Same-axis components are deliberately
# similar across runs (consistency); cross-axis components are deliberately
# distinct (divergence). This is the floor signal the meta-comparator must
# render correctly.
for run_dir in "$MC_TS1-$MC_UC-run1" "$MC_TS2-$MC_UC-run2"; do
  run_id="$run_dir"
  cat > "$MC_ROOT/$run_dir/meta.yaml" <<MMEOF
use_case_id: $MC_UC
tier: smoke
generated_at: "2026-05-10T10:00:00Z"
canvas_sha256: abc1234567890def
MMEOF
  for opt in a b c d; do
    axis="density"
    [[ "$opt" == "b" ]] && axis="metaphor"
    [[ "$opt" == "c" ]] && axis="affordance"
    [[ "$opt" == "d" ]] && axis="wildcard"
    # Same-axis-across-runs: shared common components (high Jaccard)
    # Cross-axis-within-run: distinct components (low Jaccard)
    case "$axis" in
      density)    comps='AppShell SparseHero ExecMetric ExecBadge Card AppFooter';;
      metaphor)   comps='AppShell StageRail PipelineSpine CurrentStageHero Card AppFooter';;
      affordance) comps='AppShell InlineApprover InlineReject SectionCard Card AppFooter';;
      wildcard)   comps='AppShell TimelineRow ConvoBubble RegBadge Card AppFooter';;
    esac
    mkdir -p "$MC_ROOT/$run_dir/option-$opt"
    # Render components_used list in YAML
    comps_yaml=""
    for c in $comps; do
      comps_yaml="${comps_yaml}  - name: $c\n    source: shared\n"
    done
    OPT_UP=$(printf "%s" "$opt" | tr '[:lower:]' '[:upper:]')
    cat > "$MC_ROOT/$run_dir/option-$opt/manifest.yaml" <<MEOF
schema_version: "1.0.0"
option: $OPT_UP
variation_axis: $axis
use_case_id: $MC_UC
canvas_checksum: abc1234567890def
density_score: 3
design_summary: "$axis variation, smoke fixture"
components_used:
$(printf "$comps_yaml")
build:
  build_succeeded: true
  deploy_succeeded: true
  reuse_floor_met: true
  reuse_count_shared: 6
  a11y_violations: 2
  a11y_scan_mode: "static-heuristic"
judge:
  composite_score: 4.1
  ui_standards: 4.2
  agentic_principles: 4.0
  reuse_floor_met: true
  hitl_gates_wired: true
  net_new_count: 0
  recommended: false
MEOF
  done
done

# Now build the meta-comparator from these two fixture runs
node "$REPO/scripts/build_meta_comparator.mjs" "$MC_TS1-$MC_UC-run1" "$MC_TS2-$MC_UC-run2" >/dev/null 2>&1 || true
# Find the freshly generated _meta_review.html
META_HTML=$(ls -t "$MC_ROOT/_meta/"*/_meta_review.html 2>/dev/null | head -1)
if [[ -n "$META_HTML" && -f "$META_HTML" ]]; then
  green "  ✓ meta-comparator wrote $META_HTML"
else
  red   "  ✗ meta-comparator did not produce HTML"
  failed=$((failed + 1))
fi
if [[ -f "$META_HTML" ]]; then
  if grep -q "Meta-comparator" "$META_HTML" && \
     grep -q "density" "$META_HTML" && grep -q "metaphor" "$META_HTML" && \
     grep -q "affordance" "$META_HTML" && grep -q "wildcard" "$META_HTML"; then
    green "  ✓ meta-comparator renders all 4 variation axes"
  else
    red   "  ✗ meta-comparator did not render all axes"
    failed=$((failed + 1))
  fi
  if grep -q "same-axis" "$META_HTML"; then
    green "  ✓ meta-comparator renders same-axis consistency stat"
  else
    red   "  ✗ meta-comparator missing same-axis stat"
    failed=$((failed + 1))
  fi
  if grep -q "cross-axis" "$META_HTML"; then
    green "  ✓ meta-comparator renders cross-axis divergence stat"
  else
    red   "  ✗ meta-comparator missing cross-axis stat"
    failed=$((failed + 1))
  fi
fi

# Cleanup the fixture runs (they're under archives/, which the auditor
# protects in production — but smoke test fixtures don't count as audit
# trail; we always clean up after ourselves).
rm -rf "$MC_ROOT/$MC_TS1-$MC_UC-run1" "$MC_ROOT/$MC_TS2-$MC_UC-run2"
# Also clean up the meta-comparator output (it's keyed by current timestamp)
[[ -d "$MC_ROOT/_meta" ]] && rm -rf "$MC_ROOT/_meta"
echo

if [[ $failed -gt 0 ]]; then
  red "$failed assertion(s) failed."
  exit 1
fi
green "All assertions passed."
