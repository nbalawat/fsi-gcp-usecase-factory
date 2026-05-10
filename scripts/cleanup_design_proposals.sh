#!/usr/bin/env bash
# scripts/cleanup_design_proposals.sh
#
# Tears down ALL leftover state from /fsi-design-proposals across three
# surfaces: Cloud Run services, Artifact Registry images, and GCS build
# artifacts. Three modes:
#
#   1. Targeted:   --uc <use-case>     → delete losing options for one UC
#                                        (Cloud Run + AR image + GCS objects)
#      Used by /fsi-design-review after the user picks a winner.
#
#   2. Stale sweep: --stale [--days N] → delete proposals older than N days
#                                        (default 14). Run nightly by
#                                        Cloud Scheduler so abandoned
#                                        proposals don't pile up.
#
#   3. AR / GCS only: --ar-only / --gcs-only
#      Surgical: clean up just one surface (useful if Cloud Run teardown
#      already happened but image / blob residue remains).
#
# Refuses to delete any service whose label `kind != design-proposal`.
# Refuses to delete the WINNING option's service if --uc is given AND
# the use case has a locked decision.yaml — looks up the winner from
# decision.yaml: chosen_option.
#
# Idempotent: safe to re-run; deleted resources produce a benign warning.

set -euo pipefail

REGION="${REGION:-us-central1}"
PROJECT="${GCP_PROJECT:-${PROJECT:-agentic-experiments}}"
AR_REPO="${AR_REPO:-fsi-services}"
GCS_ARTIFACT_BUCKET="${GCS_ARTIFACT_BUCKET:-${PROJECT}-fsi-design-build-artifacts}"
DAYS=14
MODE=""
UC=""
SCOPE="all"      # all | cloudrun-only | ar-only | gcs-only

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
dim()    { printf "\033[2m%s\033[0m\n" "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uc)              MODE="targeted"; UC="$2"; shift 2 ;;
    --stale)           MODE="stale"; shift ;;
    --days)            DAYS="$2"; shift 2 ;;
    --region)          REGION="$2"; shift 2 ;;
    --project)         PROJECT="$2"; shift 2 ;;
    --ar-repo)         AR_REPO="$2"; shift 2 ;;
    --gcs-bucket)      GCS_ARTIFACT_BUCKET="$2"; shift 2 ;;
    --cloudrun-only)   SCOPE="cloudrun-only"; shift ;;
    --ar-only)         SCOPE="ar-only"; shift ;;
    --gcs-only)        SCOPE="gcs-only"; shift ;;
    --dry-run)         DRY_RUN=1; shift ;;
    -h|--help)
      cat <<EOF
usage: $0 --uc <use-case>            # delete losing options for one UC
       $0 --stale [--days 14]        # delete proposals older than N days
       $0 --uc <uc> --dry-run        # show what would be deleted

Scope (default: all three surfaces):
  --cloudrun-only    Only delete Cloud Run services
  --ar-only          Only delete Artifact Registry images
  --gcs-only         Only delete GCS build artifacts

Targets only Cloud Run services named 'fsi-uc-*-design-*' with the label
'kind=design-proposal'. AR images: only those matching uc-*-design-*.
GCS: only objects under gs://\$GCS_ARTIFACT_BUCKET/ that match the UC path.

The winning option (per decision.yaml: chosen_option) is preserved unless
explicitly named via --uc with --include-winner.

Environment variables (override defaults):
  REGION=us-central1
  GCP_PROJECT=agentic-experiments
  AR_REPO=fsi-services
  GCS_ARTIFACT_BUCKET=\$PROJECT-fsi-design-build-artifacts
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
    yellow "  would delete cloud-run: $svc"
    return
  fi
  if gcloud run services delete "$svc" \
       --project="$PROJECT" --region="$REGION" --quiet 2>/dev/null; then
    green "  ✓ deleted cloud-run: $svc"
  else
    red "  ✗ failed to delete cloud-run: $svc"
  fi
}

delete_ar_image() {
  local image="$1"   # repo-path part: e.g. uc-mortgage-origination-design-a
  local uri="${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}/${image}"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    yellow "  would delete ar-image: $uri"
    return
  fi
  if gcloud artifacts docker images delete "$uri" \
       --project="$PROJECT" --quiet --delete-tags 2>/dev/null; then
    green "  ✓ deleted ar-image: $uri"
  else
    dim "  · ar-image not found (or already deleted): $uri"
  fi
}

delete_gcs_path() {
  local prefix="$1"   # e.g. gs://bucket/mortgage-origination/a/
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    yellow "  would delete gcs: $prefix"
    return
  fi
  # gsutil rm -r is idempotent (no-op on missing prefix); silence stderr noise
  if gsutil -q rm -r "$prefix" 2>/dev/null; then
    green "  ✓ deleted gcs: $prefix"
  else
    dim "  · gcs path not found (or empty): $prefix"
  fi
}

# Decide whether the chosen scope includes a given surface.
scope_includes() {
  local surface="$1"
  case "$SCOPE" in
    all)            return 0 ;;
    cloudrun-only)  [[ "$surface" == "cloudrun" ]] ;;
    ar-only)        [[ "$surface" == "ar" ]] ;;
    gcs-only)       [[ "$surface" == "gcs" ]] ;;
  esac
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
      green "  winner: option-$winner (preserved on every surface)"
    else
      yellow "  no decision.yaml — all options will be torn down"
    fi

    # ── Cloud Run ──
    if scope_includes cloudrun; then
      echo
      echo "  [cloud run]"
      found=0
      while IFS=$'\t' read -r name created; do
        [[ -z "$name" ]] && continue
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
      [[ $found -eq 0 ]] && dim "  no design-proposal services for $UC"
    fi

    # ── Artifact Registry ──
    if scope_includes ar; then
      echo
      echo "  [artifact registry]"
      for opt in a b c d e f; do
        [[ "$opt" == "$winner" ]] && { dim "  skipping winner: uc-$UC-design-$opt"; continue; }
        delete_ar_image "uc-$UC-design-$opt"
      done
    fi

    # ── GCS build artifacts ──
    if scope_includes gcs; then
      echo
      echo "  [gcs build artifacts]"
      for opt in a b c d e f; do
        [[ "$opt" == "$winner" ]] && { dim "  skipping winner: gs://$GCS_ARTIFACT_BUCKET/$UC/$opt/"; continue; }
        delete_gcs_path "gs://$GCS_ARTIFACT_BUCKET/$UC/$opt/"
      done
    fi
    ;;

  stale)
    # ── Cloud Run (stale services) ──
    declare -a stale_ucs=()
    if scope_includes cloudrun; then
      echo
      echo "  [cloud run · stale > $DAYS days]"
      found=0
      while IFS=$'\t' read -r name created; do
        [[ -z "$name" ]] && continue
        [[ "$name" == fsi-uc-*-design-* ]] || continue
        age=$(age_days "$created")
        if [[ "$age" -ge "$DAYS" ]]; then
          yellow "  stale $age days: $name (created $created)"
          delete_service "$name"
          # Capture uc + option to drive AR / GCS cleanup
          rest="${name#fsi-uc-}"                   # <uc>-design-<x>
          uc_part="${rest%-design-*}"
          opt_part="${rest##*-}"
          stale_ucs+=("$uc_part:$opt_part")
          found=$((found + 1))
        fi
      done < <(discover_services)
      [[ $found -eq 0 ]] && dim "  no stale design-proposal services"
    fi

    # ── AR + GCS for the same (uc, option) pairs we just torn down ──
    if [[ ${#stale_ucs[@]} -gt 0 ]]; then
      if scope_includes ar; then
        echo
        echo "  [artifact registry · paired with stale cloud run]"
        for pair in "${stale_ucs[@]}"; do
          uc="${pair%:*}"; opt="${pair##*:}"
          delete_ar_image "uc-$uc-design-$opt"
        done
      fi
      if scope_includes gcs; then
        echo
        echo "  [gcs · paired with stale cloud run]"
        for pair in "${stale_ucs[@]}"; do
          uc="${pair%:*}"; opt="${pair##*:}"
          delete_gcs_path "gs://$GCS_ARTIFACT_BUCKET/$uc/$opt/"
        done
      fi
    fi
    ;;
esac

echo
green "done."
