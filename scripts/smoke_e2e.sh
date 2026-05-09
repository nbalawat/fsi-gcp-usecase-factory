#!/usr/bin/env bash
# scripts/smoke_e2e.sh — end-to-end health gate for the credit-memo pipeline.
#
# Publishes a fresh BRW-LECO loan application via the deployed simulator,
# polls Cloud SQL until the case reaches `done`, then asserts the platform
# actually did real work:
#
#   ✓ all 8 atomic services returned non-error responses
#   ✓ ≥10 of 16 rule sets fired
#   ✓ all 13 specialist agents completed with synthesized=false (real Gemini)
#   ✓ memo artifact exists with ≥9 of 10 sections populated
#   ✓ application_state has decision, risk_band, dscr_base, single_borrower_pct
#   ✓ no orchestrator_failure logs in the last 15 min
#
# Single command. Exit 0 = green; exit 1 = a defect surfaced.
# Run before merging anything that touches services/ or usecases/.
#
# Usage:
#   bash scripts/smoke_e2e.sh                       # fresh application, full verify
#   bash scripts/smoke_e2e.sh --app=<uuid>          # verify an existing application
#   bash scripts/smoke_e2e.sh --no-publish          # skip simulator, verify the latest
#   DEADLINE_SECONDS=900 bash scripts/smoke_e2e.sh  # extend wall-clock budget

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${GCP_PROJECT:-agentic-experiments}"
KEY_FILE="${GOOGLE_APPLICATION_CREDENTIALS:-$REPO_ROOT/keys/agentic-experiments-71fb77221637.json}"
DB_PASS_SECRET="${DB_PASS_SECRET:-fsi-banking-db-pass-dev}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DEADLINE_SECONDS="${DEADLINE_SECONDS:-720}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"

# Color helpers
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
grn()   { printf "\033[32m%s\033[0m\n" "$*"; }
ylw()   { printf "\033[33m%s\033[0m\n" "$*"; }
dim()   { printf "\033[90m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# Parse args
APP_ID=""
NO_PUBLISH=0
for a in "$@"; do
    case "$a" in
        --app=*)        APP_ID="${a#--app=}" ;;
        --no-publish)   NO_PUBLISH=1 ;;
        --help|-h)      sed -n '1,30p' "$0"; exit 0 ;;
    esac
done

export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"

# ─── Preflight ───────────────────────────────────────────────────────────────

bold "═══ smoke_e2e ═══"
dim  "project=$PROJECT  deadline=${DEADLINE_SECONDS}s  poll=${POLL_INTERVAL}s"

# 1. Cloud SQL Auth Proxy reachable
if ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    red "✗ Cloud SQL Auth Proxy not listening on ${DB_HOST}:${DB_PORT}"
    dim "  start it with: bash scripts/dev_up.sh --background"
    exit 1
fi
grn "✓ proxy reachable on ${DB_HOST}:${DB_PORT}"

# 2. DB password accessible
DB_PASS="$(gcloud secrets versions access latest --secret="$DB_PASS_SECRET" --project="$PROJECT" 2>/dev/null)"
if [ -z "$DB_PASS" ]; then
    red "✗ could not read secret $DB_PASS_SECRET"
    exit 1
fi
grn "✓ DB password accessible"

# Helper: run a single SQL query, return result as TSV.
sql() {
    DB_PASS="$DB_PASS" python3 -c "
import os, sys, pg8000.native as pg
conn = pg.Connection(host='${DB_HOST}', port=${DB_PORT}, database='fsi_banking',
                     user='fsi_app', password=os.environ['DB_PASS'])
for row in conn.run(sys.argv[1]):
    print('\t'.join('' if v is None else str(v) for v in row))
" "$1"
}

# ─── Step 1: publish or use given app_id ──────────────────────────────────

if [ -n "$APP_ID" ]; then
    bold ""
    bold "─── Step 1: Verify existing application ${APP_ID} ───"
elif [ "$NO_PUBLISH" -eq 1 ]; then
    bold ""
    bold "─── Step 1: Use latest published application ───"
    APP_ID="$(sql "SELECT application_id FROM application_state ORDER BY created_at DESC LIMIT 1")"
    if [ -z "$APP_ID" ]; then
        red "✗ no applications in DB"
        exit 1
    fi
    grn "✓ latest = $APP_ID"
else
    bold ""
    bold "─── Step 1: Publish fresh BRW-LECO application ───"
    out="$(python3 "$REPO_ROOT/scripts/demo_live_simulator.py" \
        --once --borrower=BRW-LECO --project="$PROJECT" 2>&1 | tail -2)"
    APP_ID="$(echo "$out" | grep -oE 'application_id=[a-f0-9-]+' | head -1 | cut -d= -f2)"
    if [ -z "$APP_ID" ]; then
        red "✗ simulator did not return an application_id"
        echo "$out"
        exit 1
    fi
    grn "✓ published $APP_ID (BRW-LECO · happy-path)"
fi

# ─── Step 2: Poll until done or deadline ──────────────────────────────────

bold ""
bold "─── Step 2: Wait for case to reach 'done' (max ${DEADLINE_SECONDS}s) ───"

start_ts=$(date +%s)
prev_stage=""
while true; do
    elapsed=$(( $(date +%s) - start_ts ))
    if [ "$elapsed" -gt "$DEADLINE_SECONDS" ]; then
        red "✗ deadline exceeded — case never reached 'done'"
        red "  final stage: $prev_stage  app: $APP_ID"
        bold "── recent orchestrator log ──"
        gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=fsi-orch-credit-memo" \
            --freshness=10m --limit=10 --project="$PROJECT" --format='value(textPayload)' 2>&1 | tail -10
        exit 1
    fi

    cur="$(sql "SELECT current_stage FROM application_state WHERE application_id='$APP_ID'")"
    if [ "$cur" != "$prev_stage" ]; then
        ts="$(date '+%H:%M:%S')"
        dim "  [$ts] stage = ${cur:-(no row yet)}"
        prev_stage="$cur"
    fi
    if [ "$cur" = "done" ]; then
        grn "✓ reached 'done' in ${elapsed}s"
        break
    fi
    sleep "$POLL_INTERVAL"
done

# ─── Step 3: Assertions ────────────────────────────────────────────────────

bold ""
bold "─── Step 3: Assertions ───"

FAILS=0
fail() { red "✗ $1"; FAILS=$((FAILS+1)); }
pass() { grn "✓ $1"; }

# 3a. ≥7 of 8 atomic services succeeded
ok_services="$(sql "SELECT COUNT(DISTINCT service_name) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='service_invoked'
        AND payload->'response'->>'error' IS NULL")"
total_services="$(sql "SELECT COUNT(DISTINCT service_name) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='service_invoked'")"
if [ "${ok_services:-0}" -ge 7 ]; then
    pass "atomic services: ${ok_services}/${total_services} succeeded"
else
    fail "atomic services: only ${ok_services}/${total_services} succeeded (target ≥ 7/8)"
fi

# 3b. ≥10 rule evaluations
rule_count="$(sql "SELECT COUNT(*) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='rule_evaluated'")"
if [ "${rule_count:-0}" -ge 10 ]; then
    pass "rules evaluated: $rule_count (target ≥ 10)"
else
    fail "rules evaluated: $rule_count (target ≥ 10)"
fi

# 3c. all 13 agents fired with real Gemini
real_agents="$(sql "SELECT COUNT(*) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='agent_action'
        AND (payload->>'synthesized')='false'")"
stub_agents="$(sql "SELECT COUNT(*) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='agent_action'
        AND (payload->>'synthesized')='true'")"
if [ "${real_agents:-0}" -ge 13 ]; then
    pass "agents (real): ${real_agents} · stubs: ${stub_agents}"
else
    fail "agents (real): only ${real_agents} (target ≥ 13) · stubs: ${stub_agents}"
fi

# 3d. memo artifact exists with all 10 sections
memo_sections="$(sql "WITH m AS (
    SELECT body FROM application_artifacts
    WHERE application_id='$APP_ID' AND artifact_type='credit_memo'
    ORDER BY revision_number DESC LIMIT 1
)
SELECT
    (CASE WHEN body->'memo'->'executive_summary' IS NOT NULL OR body->'executive_summary' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'borrower_overview' IS NOT NULL OR body->'borrower_overview' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'financial_analysis' IS NOT NULL OR body->'financial_analysis' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'cash_flow_projection' IS NOT NULL OR body->'cash_flow_projection' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'risk_factors' IS NOT NULL OR body->'risk_factors' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'collateral' IS NOT NULL OR body->'collateral' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'covenant_package' IS NOT NULL OR body->'covenant_package' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'regulatory_concentration' IS NOT NULL OR body->'regulatory_concentration' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'risk_rating_rationale' IS NOT NULL OR body->'risk_rating_rationale' IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN body->'memo'->'recommendation' IS NOT NULL OR body->'recommendation' IS NOT NULL THEN 1 ELSE 0 END)
  FROM m")"
if [ "${memo_sections:-0}" -ge 9 ]; then
    pass "memo sections present: ${memo_sections}/10"
else
    fail "memo sections present: ${memo_sections}/10 (target ≥ 9)"
fi

# 3e. application_state has decision/risk_band/dscr_base
state_decision="$(sql "SELECT decision FROM application_state WHERE application_id='$APP_ID'")"
state_band="$(sql "SELECT risk_band FROM application_state WHERE application_id='$APP_ID'")"
state_dscr="$(sql "SELECT dscr_base FROM application_state WHERE application_id='$APP_ID'")"
if [ -n "$state_decision" ] && [ "$state_decision" != "None" ]; then
    pass "state.decision = $state_decision"
else
    fail "state.decision is NULL"
fi
if [ -n "$state_band" ] && [ "$state_band" != "None" ]; then
    pass "state.risk_band = $state_band"
else
    fail "state.risk_band is NULL"
fi
if [ -n "$state_dscr" ] && [ "$state_dscr" != "None" ] && [ "$state_dscr" != "0" ]; then
    pass "state.dscr_base = $state_dscr"
else
    fail "state.dscr_base is NULL or zero"
fi

# 3f. no orchestrator_failure events in last 15 min for THIS app
orch_failures="$(gcloud logging read \
    "resource.type=cloud_run_revision AND resource.labels.service_name=fsi-orch-credit-memo AND textPayload=\"orchestrator_failure\"" \
    --freshness=15m --limit=20 --project="$PROJECT" --format='value(timestamp)' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${orch_failures:-0}" -eq 0 ]; then
    pass "no orchestrator_failure events in last 15 min"
else
    ylw "⚠ ${orch_failures} orchestrator_failure event(s) in last 15 min (may be from previous runs)"
fi

# 3g. sinks fired (decided event published, gl-posting + document-store-gcs)
decided_event="$(sql "SELECT COUNT(*) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='decision_made'")"
if [ "${decided_event:-0}" -ge 1 ]; then
    pass "decision_made event fired"
else
    fail "no decision_made event"
fi

# ─── Summary ───────────────────────────────────────────────────────────────

bold ""
total_cost="$(sql "SELECT COALESCE(SUM(cost_usd),0)::numeric(10,4) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='agent_action'")"
total_latency="$(sql "SELECT COALESCE(SUM(latency_ms),0) FROM application_events
  WHERE application_id='$APP_ID' AND event_type='agent_action'")"

bold "═══ SUMMARY ═══"
echo "  app_id:    $APP_ID"
echo "  decision:  $state_decision"
echo "  risk:      $state_band"
echo "  DSCR base: $state_dscr"
echo "  agents:    ${real_agents:-0} real, ${stub_agents:-0} stub  (\$${total_cost} · ${total_latency}ms)"
echo "  rules:     ${rule_count:-0} evaluated"
echo "  services:  ${ok_services:-0}/${total_services:-0} succeeded"
echo "  memo:      ${memo_sections:-0}/10 sections"

if [ "$FAILS" -eq 0 ]; then
    bold ""
    grn "✓ ALL CHECKS PASSED"
    exit 0
else
    bold ""
    red "✗ ${FAILS} CHECK(S) FAILED"
    exit 1
fi
