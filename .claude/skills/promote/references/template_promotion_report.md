## Step 11 — Generate promotion report

Write `docs/use_cases/{uc}/promotion_report_{date}.md`:

```markdown
# Promotion report: {uc}
Date: {today}
Reviewer: Claude Code (agentic-banking-platform plugin)
Git SHA: {sha}

## Pre-flight
- Spec: ✓
- Dependencies manifest: ✓
- SLO file: ✓
- Compliance pack: ✓
- Signatures collected: ✓ ({N} of {N})

## Review verdict
- Architecture audit: PASS
- Security review: PASS
- Compliance pack completeness: PASS
- Test coverage: {%}

## Preview deployment
- Project: {project_id}
- Deploy time: {duration}
- Services deployed: {N}
- Initial health checks: ✓

## L2 e2e suite
- Tests run: {N}
- Passed: {N}
- Failed: 0
- Duration: {duration}

## Cross-impact analysis
- Use cases impacted: {list}
- Impacted suites run: {N}
- All passed: ✓

## L5 synthetic load
- Duration: 5 minutes
- Events generated: {N}
- P50 latency: {ms} (budget: {ms}) ✓
- P95 latency: {ms} (budget: {ms}) ✓
- P99 latency: {ms} (budget: {ms}) ✓
- Error rate: {%} (budget: {%}) ✓
- Decision distribution drift: {%} (threshold: {%}) ✓
- Cost per decision: ${} (budget: ${}) ✓
- Trace completeness: {%}
- Audit log completeness: {%}

## Verdict
READY FOR PRODUCTION

## Canary plan
- Canary at 5% for 24 hours
- Metrics monitored: {list}
- Auto-rollback on: {list of conditions}
- Full ramp after canary clean

## Rollback plan
