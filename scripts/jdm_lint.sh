#!/usr/bin/env bash
# jdm_lint.sh — validate a JDM (JSON Decision Model) artifact against schema
#
# Usage: jdm_lint.sh <path/to/rule.json>
#
# Invoked by: /author-rule, /review-uc

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path/to/rule.json>" >&2
    exit 2
fi

RULE_FILE="$1"
SCHEMA="${CLAUDE_PLUGIN_DIR:-.}/policies/jdm_schema.json"

if [ ! -f "$RULE_FILE" ]; then
    echo "Rule file not found: $RULE_FILE" >&2
    exit 1
fi

# JSON well-formedness
if ! jq empty "$RULE_FILE" 2>/dev/null; then
    echo "✗ JDM file is not valid JSON: $RULE_FILE" >&2
    exit 1
fi

# Schema validation (if schema exists)
if [ -f "$SCHEMA" ]; then
    if command -v ajv >/dev/null 2>&1; then
        if ! ajv validate -s "$SCHEMA" -d "$RULE_FILE" 2>&1; then
            echo "✗ JDM file fails schema validation: $RULE_FILE" >&2
            exit 1
        fi
    elif command -v python >/dev/null 2>&1; then
        python -c "
import json, sys
import jsonschema
with open('$SCHEMA') as f: schema = json.load(f)
with open('$RULE_FILE') as f: doc = json.load(f)
try:
    jsonschema.validate(doc, schema)
except jsonschema.ValidationError as e:
    print(f'✗ Validation error: {e.message}', file=sys.stderr)
    sys.exit(1)
" || exit 1
    fi
fi

# Required fields check
REQUIRED_FIELDS=("name" "version" "effective_from" "regulatory_citation" "owner")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! jq -e "has(\"$field\")" "$RULE_FILE" >/dev/null; then
        echo "✗ Missing required field: $field" >&2
        exit 1
    fi
done

# At least one decision node
if ! jq -e '.nodes | map(select(.type == "decisionTableNode" or .type == "expressionNode")) | length > 0' "$RULE_FILE" >/dev/null; then
    echo "✗ JDM has no decision or expression nodes" >&2
    exit 1
fi

echo "✓ JDM lint passed: $RULE_FILE"
exit 0
