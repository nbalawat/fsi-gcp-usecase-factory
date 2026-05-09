#!/usr/bin/env bash
# upload_all.sh — POST every demo application to /api/applications.
#
# Each application folder contains:
#   metadata.json    — JSON body for the metadata field
#   documents.json   — array of {field, doc_type, filename}
#   files/           — the actual PDF binaries
#
# Usage:
#   bash scripts/demo_applications/upload_all.sh                  # uploads all 5
#   bash scripts/demo_applications/upload_all.sh BRW-BERKSHIRE-2024  # uploads one
#   UI_BASE_URL=https://staging.example.com bash ... upload_all.sh   # against a non-local URL
#
# Each upload prints the application_id + the redirect_url that opens
# the case in the pipeline-console UI.
set -euo pipefail

UI_BASE_URL="${UI_BASE_URL:-http://localhost:3000}"
DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

upload_one() {
    local borrower_dir="$1"
    local borrower_id
    borrower_id="$(basename "$borrower_dir")"
    local metadata_path="$borrower_dir/metadata.json"
    local documents_path="$borrower_dir/documents.json"
    local files_dir="$borrower_dir/files"

    if [[ ! -f "$metadata_path" ]] || [[ ! -f "$documents_path" ]] || [[ ! -d "$files_dir" ]]; then
        echo "[skip] $borrower_id — missing metadata/documents/files" >&2
        return 0
    fi

    echo "==> Uploading $borrower_id"

    # Build the curl multipart command piece-by-piece. Each documents[].field
    # → -F "<field>=@<files_dir>/<filename>".
    local curl_args=(-sS -X POST "${UI_BASE_URL}/api/applications")
    curl_args+=(-F "metadata=$(cat "$metadata_path")")
    curl_args+=(-F "documents=$(cat "$documents_path")")

    while IFS=$'\t' read -r field filename; do
        local file_path="$files_dir/$filename"
        if [[ ! -f "$file_path" ]]; then
            echo "[fail] $borrower_id — missing file $file_path" >&2
            return 1
        fi
        curl_args+=(-F "${field}=@${file_path}")
    done < <(python3 -c "
import json, sys
docs = json.load(open('$documents_path'))
for d in docs:
    print(f\"{d['field']}\\t{d['filename']}\")
")

    local response
    response=$(curl "${curl_args[@]}" 2>&1) || {
        echo "[fail] $borrower_id — curl error: $response" >&2
        return 1
    }

    # Pretty-print key fields
    python3 - "$response" "$borrower_id" "$UI_BASE_URL" << 'PYEOF'
import json, sys
resp_text, borrower_id, base = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    r = json.loads(resp_text)
except Exception:
    print(f"[fail] {borrower_id} — non-JSON response: {resp_text[:200]}", file=sys.stderr)
    sys.exit(1)
if not r.get("ok"):
    print(f"[fail] {borrower_id} — server returned: {r.get('error', 'unknown')[:200]}", file=sys.stderr)
    sys.exit(1)

print(f"  application_id: {r['application_id']}")
print(f"  doc_count    : {r['doc_count']}")
print(f"  pubsub       : {'OK ' + (r['side_effects']['pubsub_message_id'] or '') if r['side_effects']['pubsub_published'] else 'failed: ' + (r['side_effects'].get('pubsub_reason') or 'unknown')}")
print(f"  case URL     : {base}{r['redirect_url']}")
PYEOF
}

if [[ $# -gt 0 ]]; then
    upload_one "$DEMO_DIR/$1"
else
    for borrower_dir in "$DEMO_DIR"/BRW-*/; do
        if [[ -d "$borrower_dir" ]]; then
            upload_one "$borrower_dir" || true
            echo
        fi
    done
fi
