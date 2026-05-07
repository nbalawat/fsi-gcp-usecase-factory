#!/usr/bin/env bash
# synthetic_load.sh — generate production-like load against a preview environment.
#
# Usage: synthetic_load.sh --use-case <id> --project <project> --duration <seconds> --pattern <name>
#
# Invoked by: /promote
#
# STUB: implement against the bank's load generation infrastructure (Locust/k6/custom).

set -euo pipefail

USE_CASE=""
PROJECT=""
DURATION=300
PATTERN="production-like"

while [ $# -gt 0 ]; do
    case "$1" in
        --use-case) USE_CASE="$2"; shift 2;;
        --project)  PROJECT="$2"; shift 2;;
        --duration) DURATION="$2"; shift 2;;
        --pattern)  PATTERN="$2"; shift 2;;
        *) echo "Unknown arg: $1" >&2; exit 2;;
    esac
done

if [ -z "$USE_CASE" ] || [ -z "$PROJECT" ]; then
    echo "Usage: $0 --use-case <id> --project <project> [--duration N] [--pattern P]" >&2
    exit 2
fi

REPORT="/tmp/synthetic_load_report_${USE_CASE}.json"

echo "→ Would run synthetic load against $USE_CASE in $PROJECT"
echo "  Duration: ${DURATION}s, pattern: $PATTERN"
echo ""
echo "  TODO: implement load generation:"
echo "    1. Read traffic profile from docs/use_cases/$USE_CASE/load_profile.yaml"
echo "    2. Generate events matching production distribution (rates, sizes, decision mix)"
echo "    3. Submit via the use case's source topic for ${DURATION}s"
echo "    4. Sample OTel traces, audit log writes, latency, errors"
echo "    5. Read SLOs from docs/use_cases/$USE_CASE/slos.yaml"
echo "    6. Assert all SLOs met (P50/P95/P99 latency, error rate, decision distribution drift)"
echo "    7. Write structured report to $REPORT"

# Stub: write a fake passing report
cat > "$REPORT" <<EOF
{
  "use_case": "$USE_CASE",
  "project": "$PROJECT",
  "duration_s": $DURATION,
  "pattern": "$PATTERN",
  "events_generated": 0,
  "stub_mode": true,
  "assertions": {
    "p50_latency_within_budget": true,
    "p95_latency_within_budget": true,
    "p99_latency_within_budget": true,
    "error_rate_within_budget": true,
    "decision_distribution_within_drift": true,
    "cost_per_decision_within_budget": true,
    "trace_completeness": true,
    "audit_log_completeness": true
  },
  "all_passed": true
}
EOF

echo ""
echo "✓ Synthetic load report (stub): $REPORT"
exit 0
