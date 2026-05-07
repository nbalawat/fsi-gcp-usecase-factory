#!/usr/bin/env bash
# deploy_preview.sh — build and deploy a service to the sandbox project for smoke testing.
#
# Usage: deploy_preview.sh <component_type> <name>
#   component_type: atomic | handler | agent | sink
#   name: service name
#
# Invoked by: /new-atomic-service (optional dry-run), /promote
#
# STUB: implement against the bank's GCP project and container registry.

set -euo pipefail

COMPONENT="${1:-}"
NAME="${2:-}"

if [ -z "$COMPONENT" ] || [ -z "$NAME" ]; then
    echo "Usage: $0 <atomic|handler|agent|sink> <name>" >&2
    exit 2
fi

PROJECT="${GCP_PROJECT_SANDBOX:-}"
if [ -z "$PROJECT" ]; then
    echo "GCP_PROJECT_SANDBOX not set; skipping deploy preview"
    exit 0
fi

echo "→ Would deploy $COMPONENT/$NAME to $PROJECT"
echo "  TODO: implement against bank's actual sandbox infrastructure:"
echo "    1. gcloud builds submit --tag {registry}/$NAME:preview-$(git rev-parse --short HEAD)"
echo "    2. gcloud run deploy $NAME-preview --image {registry}/$NAME:preview-... --no-traffic --project=$PROJECT"
echo "    3. Hit /healthz, verify 200"
echo "    4. gcloud run services delete $NAME-preview --quiet --project=$PROJECT"

# Stub: succeed
echo "✓ Deploy preview stub completed (no actual deployment)"
exit 0
