#!/usr/bin/env bash
# Clean deploy script — uses --set-secrets and --ingress=internal.
set -euo pipefail
gcloud run deploy fsi-atomic-clean \
    --source=services/atomic/clean/ \
    --region="${GCP_REGION:-us-central1}" \
    --service-account="$SA_EMAIL" \
    --set-env-vars="GCP_PROJECT=${PROJECT}" \
    --set-secrets="DB_PASS=${DB_PASS_SECRET}:latest" \
    --no-allow-unauthenticated \
    --ingress=internal-and-cloud-load-balancing \
    --quiet
