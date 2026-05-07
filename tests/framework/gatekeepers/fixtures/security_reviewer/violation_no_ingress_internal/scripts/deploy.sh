#!/usr/bin/env bash
# VIOLATION: gcloud run deploy missing --ingress flag.
# Without --ingress=internal[-and-cloud-load-balancing], Cloud Run accepts
# external traffic at *.run.app.
set -euo pipefail
gcloud run deploy fsi-atomic-x \
    --source=services/atomic/x/ \
    --region=us-central1 \
    --set-env-vars="GCP_PROJECT=${PROJECT}" \
    --set-secrets="DB_PASS=fsi-banking-db-pass-dev:latest" \
    --no-allow-unauthenticated \
    --quiet
