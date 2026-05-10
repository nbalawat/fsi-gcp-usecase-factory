#!/usr/bin/env bash
# scripts/cleanup_design_proposals.sh
#
# Tears down ephemeral design-proposal Cloud Run services. Two modes:
#
#   1. Targeted: --uc <use-case>  →  delete fsi-uc-<uc>-design-* services
#      Used by /fsi-design-review after the user picks a winner — losing
#      options are torn down immediately.
#
#   2. Stale sweep: --stale [--days N]  →  delete any fsi-uc-*-design-*
#      service older than N days (default 14). Run nightly by Cloud
#      Scheduler so abandoned proposals don't pile up.
#
# Refuses to delete any service whose label `kind != design-proposal`.
# Refuses to delete the WINNING option's service if --uc is given AND
# the use case has a locked decision.yaml — we look up the winner from
# decision.yaml: chosen_option to know which to skip.
#
# Idempotent: safe to re-run; deleted services produce a benign warning.

set -euo pipefail

REGION="${REGION:-us-central1}"
PROJECT="${GCP_PROJECT:-${PROJECT:-agentic-experiments}}"
DAYS=14
MODE=""
UC=""

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
dim()    { printf "\033[2m%s\033[0m\n" "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uc)    MODE="targeted"; UC="$2"; shift 2 ;;
    --stale) MODE="stale"; shift ;;
    --days)  DAYS="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      cat <<EOF
usage: $0 --uc <use-case>            # delete losing options for one UC
       $0 --stale [--days 14]        # delete proposals older than N days
       $0 --uc <uc> --dry-run        # show what would be deleted

Targets only Cloud Run services named 'fsi-uc-*-design-*' with the label
'kind=design-proposal'. The winning option (per decision.yaml) is preserved
unless explicitly named via --uc with --include-winner.
EOF
      exit 0
      ;;
    *) red "unknown arg: $1"; exit 2 ;;
  esac
done

if [[ -z "$MODE" ]]; then
  red "must specify --uc <use-case> OR --stale"
  exit 2
fi

require_gcloud() {
  if ! command -v gcloud >/dev/null 2>&1; then
    red "gcloud not on PATH"; exit 2
  fi
  if ! gcloud auth list --filter=status=ACTIVE --format="value(account)" | grep -q .; then
    red "no active gcloud account; run gcloud auth login"; exit 2
  fi
}

discover_services() {
  # Returns one line per matching service: NAME<TAB>CREATE_TIME
  gcloud run services list \
    --project="$PROJECT" \
    --region="$REGION" \
    --filter="metadata.labels.kind=design-proposal" \
    --format="value(metadata.name,metadata.creationTimestamp)" \
    2>/dev/null
}

winner_for_uc() {
  local uc="$1"
  local f="usecases/$uc/ui/decision.yaml"
  if [[ ! -f "$f" ]]; then
    echo ""
    return
  fi
  grep -E '^chosen_option:' "$f" | awk '{print tolower($2)}' | tr -d '"'
}

age_days() {
  # Cross-platform date math: gcloud emits ISO-8601, we want elapsed days
  local ts="$1"
  python3 - <<PY
from datetime import datetime, timezone
ts = "$ts"
# tolerate trailing Z + fractional seconds
ts = ts.replace("Z", "+00:00")
try:
    t = datetime.fromisoformat(ts)
except Exception:
    print("999")
    raise SystemExit
now = datetime.now(timezone.utc)
print((now - t).days)
PY
}

delete_service() {
  local svc="$1"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    yellow "  would delete: $svc"
    return
  fi
  if gcloud run services delete "$svc" \
       --project="$PROJECT" --region="$REGION" --quiet 2>/dev/null; then
    green "  ✓ deleted: $svc"
  else
    red "  ✗ failed to delete: $svc"
  fi
}

require_gcloud

echo "─── design-proposal cleanup ─────────────────────────────"
echo "  project: $PROJECT  region: $REGION  mode: $MODE"
echo

case "$MODE" in
  targeted)
    if [[ -z "$UC" ]]; then red "missing --uc"; exit 2; fi
    winner=$(winner_for_uc "$UC")
    if [[ -n "$winner" ]]; then
      green "  winner: option-$winner (preserved)"
    else
      yellow "  no decision.yaml — all options will be torn down"
    fi
    found=0
    while IFS=$'\t' read -r name created; do
      [[ -z "$name" ]] && continue
      # Match fsi-uc-<uc>-design-<x>
      if [[ "$name" == "fsi-uc-$UC-design-"* ]]; then
        opt="${name##*-}"
        if [[ "$opt" == "$winner" ]]; then
          dim "  skipping winner: $name"
        else
          delete_service "$name"
        fi
        found=$((found + 1))
      fi
    done < <(discover_services)
    if [[ $found -eq 0 ]]; then
      dim "  no design-proposal services for $UC"
    fi
    ;;

  stale)
    found=0
    while IFS=$'\t' read -r name created; do
      [[ -z "$name" ]] && continue
      [[ "$name" == fsi-uc-*-design-* ]] || continue
      age=$(age_days "$created")
      if [[ "$age" -ge "$DAYS" ]]; then
        yellow "  stale $age days: $name (created $created)"
        delete_service "$name"
        found=$((found + 1))
      fi
    done < <(discover_services)
    if [[ $found -eq 0 ]]; then
      dim "  no stale design-proposal services older than $DAYS days"
    fi
    ;;
esac

echo
green "done."
