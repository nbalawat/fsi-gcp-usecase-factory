#!/usr/bin/env bash
# Deploy script with DB_PASS as plaintext env var — VIOLATION.
# DB_PASS belongs in Secret Manager, mounted via --set-secrets.
set -euo pipefail
gcloud run deploy fsi-atomic-x \
    --source=services/atomic/x/ \
    --region=us-central1 \
    --set-env-vars="GCP_PROJECT=${PROJECT},DB_PASS=${DB_PASS}" \
    --no-allow-unauthenticated \
    --ingress=internal \
    --quiet
