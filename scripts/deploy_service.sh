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
    elif [[ -d "$REPO_ROOT/services/orchestrator-credit-memo" ]] && [[ "$svc" == "orchestrator-credit-memo" ]]; then
        svc_dir="$REPO_ROOT/services/orchestrator-credit-memo"
        svc_type="orchestrator"
        cloud_run_name="fsi-orch-credit-memo"
    elif [[ -d "$REPO_ROOT/services/orchestrator-credit-memo-v2" ]] && [[ "$svc" == "orchestrator-credit-memo-v2" ]]; then
        svc_dir="$REPO_ROOT/services/orchestrator-credit-memo-v2"
        svc_type="orchestrator-v2"
        cloud_run_name="fsi-orch-credit-memo-v2"
    elif [[ -d "$REPO_ROOT/services/audit-writer" ]] && [[ "$svc" == "audit-writer" ]]; then
        svc_dir="$REPO_ROOT/services/audit-writer"
        svc_type="audit-writer"
        cloud_run_name="fsi-audit-writer"
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

    # Ingress: in dev we use 'all' so smoke tests can hit the service via *.run.app
    # (still auth-required, --no-allow-unauthenticated). In prod set INGRESS=internal
    # so only Cloud Workflows/Pub/Sub-push (internal Google services) can call.
    INGRESS="${INGRESS:-all}"

    # rules-service needs the repo's rules/ + usecases/*/rules/ baked into its
    # build context. Stage a build dir that includes them, then deploy from there.
    # main.py auto-discovers rules/ and usecases/*/rules/ at the service directory
    # root (= /app at runtime), so just drop them there — no env var needed.
    if [[ "$svc" == "document-extractor" ]]; then
        # Stage the schemas dir into the build context so the Dockerfile's
        # COPY _schemas works. Use a temp build dir so we don't pollute git.
        BUILD_DIR="$(mktemp -d -t docext-build.XXXXXX)"
        trap "rm -rf '$BUILD_DIR'" RETURN
        cp -R "$svc_dir/." "$BUILD_DIR/"
        mkdir -p "$BUILD_DIR/_schemas"
        cp -R "$REPO_ROOT/usecases/credit-memo-commercial/schemas/." "$BUILD_DIR/_schemas/"
        ENV_VARS+=",DOCUMENT_SCHEMAS_DIR=/app/_schemas"
        # Without a VPC connector, the Cloud SQL Connector reaches the
        # instance via its PUBLIC IP. (PRIVATE requires the VPC connector.)
        ENV_VARS+=",DB_IP_TYPE=PUBLIC"
        SOURCE_PATH="$BUILD_DIR"
    elif [[ "$svc_type" == "rules" ]]; then
        BUILD_DIR="$(mktemp -d -t rules-svc-build.XXXXXX)"
        trap "rm -rf '$BUILD_DIR'" RETURN
        cp -R "$svc_dir/." "$BUILD_DIR/"
        cp -R "$REPO_ROOT/rules" "$BUILD_DIR/" 2>/dev/null || true
        mkdir -p "$BUILD_DIR/usecases"
        for uc_dir in "$REPO_ROOT/usecases"/*/; do
            uc="$(basename "$uc_dir")"
            if [[ -d "$uc_dir/rules" ]]; then
                mkdir -p "$BUILD_DIR/usecases/$uc"
                cp -R "$uc_dir/rules" "$BUILD_DIR/usecases/$uc/"
            fi
        done
        SOURCE_PATH="$BUILD_DIR"
    elif [[ "$svc_type" == "orchestrator-v2" ]]; then
        # orchestrator-v2 hosts the 5 consolidated agents. Stage the
        # agents + prompts into the build context so main.py can
        # importlib-load them at runtime.
        BUILD_DIR="$(mktemp -d -t orchv2-build.XXXXXX)"
        trap "rm -rf '$BUILD_DIR'" RETURN
        cp -R "$svc_dir/." "$BUILD_DIR/"
        mkdir -p "$BUILD_DIR/usecases/credit-memo-commercial"
        cp -R "$REPO_ROOT/usecases/credit-memo-commercial/agents" "$BUILD_DIR/usecases/credit-memo-commercial/"
        cp -R "$REPO_ROOT/usecases/credit-memo-commercial/schemas" "$BUILD_DIR/usecases/credit-memo-commercial/"
        SOURCE_PATH="$BUILD_DIR"
    elif [[ "$svc_type" == "orchestrator" ]]; then
        # Orchestrator needs prompts/, agents/, schemas/ baked into the build
        # context. main.py walks REPO_ROOT/usecases/credit-memo-commercial/...
        # which at runtime resolves to /app/usecases/credit-memo-commercial/...
        BUILD_DIR="$(mktemp -d -t orch-build.XXXXXX)"
        trap "rm -rf '$BUILD_DIR'" RETURN
        cp -R "$svc_dir/." "$BUILD_DIR/"
        mkdir -p "$BUILD_DIR/usecases/credit-memo-commercial"
        cp -R "$REPO_ROOT/usecases/credit-memo-commercial/agents" "$BUILD_DIR/usecases/credit-memo-commercial/"
        cp -R "$REPO_ROOT/usecases/credit-memo-commercial/schemas" "$BUILD_DIR/usecases/credit-memo-commercial/"

        # Atomic-service URLs from .fsi-state for env vars (orchestrator falls
        # back to env when /app/.fsi-state/ doesn't exist at runtime).
        for s in financial-spreader dscr-calculator covenant-analyzer peer-benchmarker industry-risk-scorer collateral-valuator exposure-aggregator insider-screening; do
            url_file="$REPO_ROOT/.fsi-state/${s}.url"
            if [[ -f "$url_file" ]]; then
                env_key="ATOMIC_$(echo "${s//-/_}" | tr '[:lower:]' '[:upper:]')_URL"
                ENV_VARS+=",${env_key}=$(cat "$url_file" | tr -d '\n')"
            fi
        done
        rs_url="$REPO_ROOT/.fsi-state/rules-service.url"
        if [[ -f "$rs_url" ]]; then
            ENV_VARS+=",RULES_SERVICE_URL=$(cat "$rs_url" | tr -d '\n')"
        fi
        ENV_VARS+=",PUBSUB_TOPIC_DECIDED=projects/${PROJECT}/topics/credit-memo-commercial.decided"
        SOURCE_PATH="$BUILD_DIR"
    else
        SOURCE_PATH="$svc_dir"
    fi

    # Memory + timeout — orchestrator runs the full agent DAG so it needs more.
    if [[ "$svc_type" == "orchestrator" ]]; then
        MEMORY="${MEMORY:-2Gi}"
        TIMEOUT="${TIMEOUT:-3600s}"   # Pub/Sub push max; matches ack-deadline=600
        CONCURRENCY="${CONCURRENCY:-4}"
    elif [[ "$svc_type" == "orchestrator-v2" ]]; then
        MEMORY="${MEMORY:-1Gi}"
        TIMEOUT="${TIMEOUT:-300s}"     # Single Vertex agent call; drafter < 120s
        CONCURRENCY="${CONCURRENCY:-8}"
    else
        MEMORY="${MEMORY:-512Mi}"
        TIMEOUT="${TIMEOUT:-60s}"
        CONCURRENCY="${CONCURRENCY:-80}"
    fi

    # Secrets — DB_PASS always; ANTHROPIC_API_KEY for the orchestrator if the
    # secret exists (gracefully no-op when missing — the orchestrator falls
    # back to a deterministic agent stub).
    SECRETS="DB_PASS=${DB_PASS_SECRET}:latest"
    if [[ "$svc_type" == "orchestrator" ]] || [[ "$svc_type" == "orchestrator-v2" ]]; then
        if gcloud secrets describe anthropic-api-key --project="$PROJECT" >/dev/null 2>&1; then
            SECRETS+=",ANTHROPIC_API_KEY=anthropic-api-key:latest"
        fi
    fi

    # document-extractor needs the Landing AI key. Egress allow-listed for
    # api.va.landing.ai is enforced via VPC firewall rules; here we just
    # mount the credential.
    if [[ "$svc" == "document-extractor" ]]; then
        if gcloud secrets describe landing-ai-api-key --project="$PROJECT" >/dev/null 2>&1; then
            SECRETS+=",LANDING_AI_API_KEY=landing-ai-api-key:latest"
        else
            echo "WARN: document-extractor needs landing-ai-api-key secret; deploy will fail at boot" >&2
        fi
    fi

    # document-extractor must reach api.va.landing.ai (public internet).
    # The VPC connector + private-ranges-only blocks public egress; without
    # a Cloud NAT in place, all-traffic also fails. Solution: don't put
    # this service through the VPC at all. It uses:
    #   - Cloud SQL via the Cloud SQL Connector library (INSTANCE_CONNECTION_NAME)
    #   - GCS via Google's public API endpoints
    #   - Landing AI via public HTTPS
    # All three work without a VPC connector on Cloud Run.
    VPC_FLAGS=(
        --vpc-connector="${VPC_CONNECTOR:-fsi-banking-dev}"
        --vpc-egress="${VPC_EGRESS:-private-ranges-only}"
    )
    if [[ "$svc" == "document-extractor" ]]; then
        VPC_FLAGS=(--clear-vpc-connector)
    fi
    # Bump timeout for document-extractor — Landing AI ADE on a 152-page PDF
    # takes 5+ minutes (measured); private docs may push it longer.
    if [[ "$svc" == "document-extractor" ]]; then
        TIMEOUT="${TIMEOUT_OVERRIDE:-600s}"
        MEMORY="${MEMORY_OVERRIDE:-1Gi}"
    fi

    gcloud run deploy "$cloud_run_name" \
        --source="$SOURCE_PATH" \
        --region="$REGION" \
        --project="$PROJECT" \
        --service-account="$SA_EMAIL" \
        --set-env-vars="$ENV_VARS" \
        --set-secrets="$SECRETS" \
        --no-allow-unauthenticated \
        --ingress="$INGRESS" \
        "${VPC_FLAGS[@]}" \
        --memory="$MEMORY" \
        --cpu=1 \
        --min-instances=0 \
        --max-instances=10 \
        --concurrency="$CONCURRENCY" \
        --timeout="$TIMEOUT" \
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
