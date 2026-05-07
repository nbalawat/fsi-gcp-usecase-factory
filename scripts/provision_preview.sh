#!/usr/bin/env bash
# provision_preview.sh — provision an ephemeral GCP project for promotion testing.
#
# Usage: provision_preview.sh <use_case>
# Output: prints the new project ID to stdout
#
# Invoked by: /promote
#
# STUB: implement against the bank's GCP organization, billing account, and folder structure.

set -euo pipefail

USE_CASE="${1:-}"
if [ -z "$USE_CASE" ]; then
    echo "Usage: $0 <use_case_id>" >&2
    exit 2
fi

# Stub: print a fake project ID and skip real provisioning
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
PROJECT_ID="preview-${USE_CASE}-${SHA}"

echo "→ Would provision GCP project: $PROJECT_ID" >&2
echo "  TODO: implement against bank's GCP org:" >&2
echo "    1. gcloud projects create $PROJECT_ID --folder={preview_folder_id}" >&2
echo "    2. gcloud beta billing projects link $PROJECT_ID --billing-account={ba}" >&2
echo "    3. Enable APIs: run, workflows, pubsub, bigquery, aiplatform, secretmanager, cloudkms" >&2
echo "    4. Create CMEK keyring + key" >&2
echo "    5. Configure VPC, VPC connector" >&2
echo "    6. Set up Pub/Sub topics from {use_case}/dependencies.yaml" >&2
echo "    7. Set up audit BigQuery dataset" >&2
echo "" >&2
echo "✓ Stub: would have provisioned $PROJECT_ID" >&2

# Print the project ID to stdout (this is what /promote consumes)
echo "$PROJECT_ID"
exit 0
