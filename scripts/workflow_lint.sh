#!/usr/bin/env bash
# workflow_lint.sh — validate Cloud Workflows YAML
#
# Usage: workflow_lint.sh <path/to/workflow.yaml>
#
# Invoked by: /new-use-case, /review-uc

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path/to/workflow.yaml>" >&2
    exit 2
fi

WORKFLOW="$1"

if [ ! -f "$WORKFLOW" ]; then
    echo "Workflow file not found: $WORKFLOW" >&2
    exit 1
fi

# YAML well-formedness
if ! python -c "import yaml; yaml.safe_load(open('$WORKFLOW'))" 2>/dev/null; then
    echo "✗ Workflow file is not valid YAML: $WORKFLOW" >&2
    exit 1
fi

# Line count under 500
LINES=$(wc -l < "$WORKFLOW")
if [ "$LINES" -gt 500 ]; then
    echo "✗ Workflow exceeds 500 lines ($LINES). Decompose into sub-workflows." >&2
    exit 1
fi

# Bank-specific checks via Python
python <<EOF
import yaml
import sys

with open("$WORKFLOW") as f:
    wf = yaml.safe_load(f)

errors = []

def walk_steps(steps, path=""):
    """Walk all steps recursively, including nested ones."""
    for step in steps:
        if isinstance(step, dict):
            for name, body in step.items():
                full = f"{path}/{name}"
                if not isinstance(body, dict):
                    continue
                # Every call step must have a timeout
                if "call" in body and "args" in body:
                    args = body.get("args", {})
                    if isinstance(args, dict) and "timeout" not in args:
                        # Allow missing timeout only on internal Google API calls
                        url = args.get("url", "")
                        if not url.startswith("\${"):
                            errors.append(f"{full}: HTTP call missing 'timeout'")
                # Recurse into nested
                for k in ("steps", "branches"):
                    if k in body:
                        walk_steps(body[k] if isinstance(body[k], list) else [body[k]], full)

main = wf.get("main", {})
if "steps" in main:
    walk_steps(main["steps"])

# Check context_id propagation in step bodies (heuristic)
text = open("$WORKFLOW").read()
if "context_id" not in text:
    errors.append("workflow does not propagate context_id (no 'context_id' references found)")

if errors:
    for e in errors:
        print(f"✗ {e}", file=sys.stderr)
    sys.exit(1)
EOF

echo "✓ Workflow lint passed: $WORKFLOW ($LINES lines)"
exit 0
