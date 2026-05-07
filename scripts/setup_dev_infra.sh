#!/usr/bin/env bash
# setup_dev_infra.sh — one-time GCP resource provisioning for fsi-banking dev
#
# Safe to re-run (idempotent — skips resources that already exist).
# Provisions: Pub/Sub topics, BigQuery dataset + threshold tables, GCS buckets.
#
# Usage: source dev.env && bash scripts/setup_dev_infra.sh
set -euo pipefail

PROJECT="${GCP_PROJECT:-agentic-experiments}"
REGION="${GCP_REGION:-us-central1}"

ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
skip() { printf '\033[33m–\033[0m %s (already exists)\n' "$*"; }
info() { printf '  %s\n' "$*"; }

echo "=== FSI Banking dev infra setup ==="
echo "    project: $PROJECT  region: $REGION"
echo ""

# ── Pub/Sub topics ──────────────────────────────────────────────────────────
echo "Pub/Sub topics:"

create_topic() {
    local topic="$1"
    if gcloud pubsub topics describe "$topic" --project="$PROJECT" &>/dev/null; then
        skip "$topic"
    else
        gcloud pubsub topics create "$topic" --project="$PROJECT"
        ok "$topic"
    fi
}

create_topic "loans.application.submitted"
create_topic "credit-memo-commercial.enriched"
create_topic "credit-memo-commercial.dlq"
create_topic "credit-memo-commercial.approval-callbacks"

# ── BigQuery ─────────────────────────────────────────────────────────────────
echo ""
echo "BigQuery:"

if bq ls --project_id="$PROJECT" fsi_banking &>/dev/null; then
    skip "dataset fsi_banking"
else
    bq mk --project_id="$PROJECT" --dataset \
        --description="FSI banking platform — thresholds, audit logs" \
        fsi_banking
    ok "dataset fsi_banking"
fi

# Regulatory thresholds table (seed with placeholder data)
BQ_THRESHOLDS_SCHEMA='[
  {"name":"rule_name","type":"STRING","mode":"REQUIRED"},
  {"name":"version","type":"STRING","mode":"REQUIRED"},
  {"name":"effective_date","type":"DATE","mode":"REQUIRED"},
  {"name":"threshold_key","type":"STRING","mode":"REQUIRED"},
  {"name":"threshold_value","type":"FLOAT64","mode":"REQUIRED"},
  {"name":"currency","type":"STRING","mode":"NULLABLE"},
  {"name":"notes","type":"STRING","mode":"NULLABLE"}
]'

if bq show --project_id="$PROJECT" fsi_banking.regulatory_thresholds &>/dev/null; then
    skip "table regulatory_thresholds"
else
    echo "$BQ_THRESHOLDS_SCHEMA" > /tmp/thresholds_schema.json
    bq mk --project_id="$PROJECT" \
        --table \
        --description="Regulatory thresholds versioned by effective_date" \
        fsi_banking.regulatory_thresholds \
        /tmp/thresholds_schema.json
    ok "table regulatory_thresholds"

    # Seed with 2026-q2 thresholds for credit memo
    cat > /tmp/thresholds_seed.jsonl <<'EOF'
{"rule_name":"single_borrower_exposure","version":"1.0","effective_date":"2026-01-01","threshold_key":"pct_of_tier1_capital","threshold_value":0.15,"currency":null,"notes":"OCC 12 CFR 32 — 15% of Tier 1 capital"}
{"rule_name":"single_borrower_exposure","version":"1.0","effective_date":"2026-01-01","threshold_key":"aggregate_limit_usd","threshold_value":50000000.0,"currency":"USD","notes":"Combined limit including unfunded commitments"}
{"rule_name":"regulatory_thresholds","version":"2026-q2","effective_date":"2026-04-01","threshold_key":"cecl_stage_1_pd_max","threshold_value":0.01,"currency":null,"notes":"CECL Stage 1 PD threshold"}
{"rule_name":"regulatory_thresholds","version":"2026-q2","effective_date":"2026-04-01","threshold_key":"dscr_minimum_pass","threshold_value":1.25,"currency":null,"notes":"Minimum DSCR for pass-rated loans"}
{"rule_name":"regulatory_thresholds","version":"2026-q2","effective_date":"2026-04-01","threshold_key":"dscr_minimum_special_mention","threshold_value":1.10,"currency":null,"notes":"Minimum DSCR for special mention"}
EOF
    bq load --project_id="$PROJECT" \
        --source_format=NEWLINE_DELIMITED_JSON \
        fsi_banking.regulatory_thresholds \
        /tmp/thresholds_seed.jsonl
    ok "seeded regulatory_thresholds with 2026-q2 data"
fi

# Audit log table
BQ_AUDIT_SCHEMA='[
  {"name":"event_time","type":"TIMESTAMP","mode":"REQUIRED"},
  {"name":"context_id","type":"STRING","mode":"REQUIRED"},
  {"name":"use_case","type":"STRING","mode":"REQUIRED"},
  {"name":"component","type":"STRING","mode":"REQUIRED"},
  {"name":"action","type":"STRING","mode":"REQUIRED"},
  {"name":"actor","type":"STRING","mode":"NULLABLE"},
  {"name":"payload_hash","type":"STRING","mode":"NULLABLE"},
  {"name":"outcome","type":"STRING","mode":"REQUIRED"}
]'

if bq show --project_id="$PROJECT" fsi_banking.audit_log &>/dev/null; then
    skip "table audit_log"
else
    echo "$BQ_AUDIT_SCHEMA" > /tmp/audit_schema.json
    bq mk --project_id="$PROJECT" --table \
        --description="Immutable audit log for all FSI agent actions" \
        --time_partitioning_field=event_time \
        fsi_banking.audit_log \
        /tmp/audit_schema.json
    ok "table audit_log"
fi

# ── GCS buckets ──────────────────────────────────────────────────────────────
echo ""
echo "GCS buckets:"

create_bucket() {
    local bucket="$1"
    local desc="$2"
    if gsutil ls "gs://$bucket" &>/dev/null; then
        skip "gs://$bucket"
    else
        gsutil mb -p "$PROJECT" -l "$REGION" -b on "gs://$bucket"
        gsutil label ch -l "use_case:credit-memo-commercial" "gs://$bucket"
        ok "gs://$bucket ($desc)"
    fi
}

create_bucket "${PROJECT}-credit-memo-docs" "versioned credit memo PDFs"
create_bucket "${PROJECT}-fsi-demo-data"    "synthetic demo borrower data"

# ── Pub/Sub subscriptions ────────────────────────────────────────────────────
echo ""
echo "Pub/Sub subscriptions (for handler push):"

create_sub() {
    local sub="$1" topic="$2" push_endpoint="$3"
    if gcloud pubsub subscriptions describe "$sub" --project="$PROJECT" &>/dev/null; then
        skip "subscription $sub"
    else
        if [[ -n "$push_endpoint" ]]; then
            gcloud pubsub subscriptions create "$sub" \
                --topic="$topic" \
                --push-endpoint="$push_endpoint" \
                --ack-deadline=60 \
                --project="$PROJECT"
        else
            gcloud pubsub subscriptions create "$sub" \
                --topic="$topic" \
                --ack-deadline=60 \
                --project="$PROJECT"
        fi
        ok "$sub → $topic"
    fi
}

# Handler subscription (push endpoint set after handler is deployed)
create_sub "credit-memo-handler-sub" "loans.application.submitted" ""
create_sub "credit-memo-dlq-sub"     "credit-memo-commercial.dlq"  ""

echo ""
echo "=== Dev infra ready ==="
echo ""
echo "Next: bash scripts/run_local.sh <service-name>"
echo "      bash scripts/deploy_service.sh <service-name>"
