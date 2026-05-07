#!/usr/bin/env bash
# deploy_service.sh — deploy one atomic service or handler to Cloud Run (source deploy).
#
# Uses gcloud run deploy --source which triggers Cloud Build.
# No local Docker required. ~90 seconds per service.
#
# Usage:
#   source dev.env && bash scripts/deploy_service.sh financial-spreader
#   source dev.env && bash scripts/deploy_service.sh credit-memo-commercial  # handler
#   source dev.env && bash scripts/deploy_service.sh --all                   # all built services
#
# After deploy, runs smoke_test_service.sh automatically.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${GCP_PROJECT:-agentic-experiments}"
REGION="${GCP_REGION:-us-central1}"
SA_EMAIL="fsi-gcp-factory-usecases@${PROJECT}.iam.gserviceaccount.com"

SERVICE="${1:-}"

if [[ -z "$SERVICE" ]]; then
    echo "usage: source dev.env && bash scripts/deploy_service.sh <service-name|--all>" >&2
    exit 2
fi

deploy_one() {
    local svc="$1"
    local svc_dir=""
    local svc_type=""

    if [[ -d "$REPO_ROOT/services/atomic/$svc" ]]; then
        svc_dir="$REPO_ROOT/services/atomic/$svc"
        svc_type="atomic"
        cloud_run_name="fsi-atomic-${svc}"
    elif [[ -d "$REPO_ROOT/services/rules-service" ]] && [[ "$svc" == "rules-service" ]]; then
        svc_dir="$REPO_ROOT/services/rules-service"
        svc_type="rules"
        cloud_run_name="fsi-rules-service"
    elif [[ -d "$REPO_ROOT/usecases/$svc/handler" ]]; then
        # Handler is named after the use case (e.g. "credit-memo-commercial")
        svc_dir="$REPO_ROOT/usecases/$svc/handler"
        svc_type="handler"
        cloud_run_name="fsi-handler-${svc}"
    elif [[ "$svc" == */sinks/* ]]; then
        # e.g. "credit-memo-commercial/sinks/gl-posting"
        svc_dir="$REPO_ROOT/usecases/$svc"
        svc_type="sink"
        sink_name="$(basename "$svc")"
        cloud_run_name="fsi-sink-${sink_name}"
    else
        echo "ERROR: $svc not found in services/atomic/, services/rules-service, usecases/<uc>/handler, or usecases/<uc>/sinks/" >&2
        return 1
    fi

    echo ""
    echo "=== Deploying $svc ($svc_type) ==="
    echo "    Cloud Run service: $cloud_run_name"
    echo "    Region: $REGION"
    start_time=$SECONDS

    # Non-sensitive env vars
    ENV_VARS="GCP_PROJECT=${PROJECT}"
    ENV_VARS+=",DB_USER=${DB_USER:-fsi_app}"
    ENV_VARS+=",DB_NAME=${DB_NAME:-fsi_banking}"
    ENV_VARS+=",INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME:-${PROJECT}:${REGION}:fsi-banking-dev}"
    ENV_VARS+=",GCS_MEMO_BUCKET=${GCS_MEMO_BUCKET:-${PROJECT}-credit-memo-docs}"
    ENV_VARS+=",PUBSUB_TOPIC_CREDIT_MEMO_ENRICHED=${PUBSUB_TOPIC_CREDIT_MEMO_ENRICHED:-projects/${PROJECT}/topics/credit-memo-commercial.enriched}"
    ENV_VARS+=",PUBSUB_TOPIC_CREDIT_MEMO_DLQ=${PUBSUB_TOPIC_CREDIT_MEMO_DLQ:-projects/${PROJECT}/topics/credit-memo-commercial.dlq}"

    # Database password is mounted from Secret Manager — never as a plaintext env var.
    # The secret 'fsi-banking-db-pass-dev' must exist (created by the shared Cloud SQL TF).
    DB_PASS_SECRET="${DB_PASS_SECRET:-fsi-banking-db-pass-dev}"

    gcloud run deploy "$cloud_run_name" \
        --source="$svc_dir" \
        --region="$REGION" \
        --project="$PROJECT" \
        --service-account="$SA_EMAIL" \
        --set-env-vars="$ENV_VARS" \
        --set-secrets="DB_PASS=${DB_PASS_SECRET}:latest" \
        --no-allow-unauthenticated \
        --ingress=internal \
        --memory=512Mi \
        --cpu=1 \
        --min-instances=0 \
        --max-instances=10 \
        --concurrency=80 \
        --timeout=60s \
        --quiet

    elapsed=$((SECONDS - start_time))
    echo "Deployed in ${elapsed}s"

    # Get the URL and run smoke test
    url=$(gcloud run services describe "$cloud_run_name" \
        --region="$REGION" \
        --project="$PROJECT" \
        --format="value(status.url)")
    echo "URL: $url"

    # Store URL for other scripts
    mkdir -p "$REPO_ROOT/.fsi-state"
    echo "$url" > "$REPO_ROOT/.fsi-state/${svc}.url"

    echo ""
    echo "Running smoke test..."
    bash "$REPO_ROOT/scripts/smoke_test_service.sh" "$svc" --gcp
}

if [[ "$SERVICE" == "--all" ]]; then
    echo "Deploying all built services..."
    for svc_dir in "$REPO_ROOT/services/atomic"/*/; do
        svc="$(basename "$svc_dir")"
        if [[ -f "$svc_dir/main.py" ]] && [[ -f "$svc_dir/manifest.json" ]]; then
            deploy_one "$svc" || echo "WARN: $svc failed, continuing..."
        fi
    done
else
    deploy_one "$SERVICE"
fi
