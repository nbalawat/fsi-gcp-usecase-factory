---
name: promote
description: Run the full promotion gate → preview deploy → L2 e2e + cross-impact suites → L5 synthetic load → SLO check → promotion report. Refuses on any gate fail.
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, Bash(git:*, ls:*, cat:*, terraform:*, gcloud:*, pytest:*, jq:*)
---

You are running the promotion gate for a use case.

This is the last gate before production. Be strict. Any failure should block promotion.

## Step 1 — Identify the use case

Use `$ARGUMENTS` if provided. Otherwise infer from current branch / changed files. Confirm with user.

## Step 2 — Pre-flight checks

Verify required artifacts exist:

```bash
# Spec, dependencies, SLOs
test -f docs/use_cases/{uc}/spec.md
test -f docs/use_cases/{uc}/dependencies.yaml
test -f docs/use_cases/{uc}/slos.yaml

# Compliance pack
test -d docs/use_cases/{uc}/compliance_pack/
test -f docs/use_cases/{uc}/compliance_pack/model_card.md
test -f docs/use_cases/{uc}/compliance_pack/audit_trail_spec.md
test -f docs/use_cases/{uc}/compliance_pack/signatures_required.md

# Workflow
test -f usecases/{uc}/workflow.yaml

# Tests
test -d usecases/{uc}/tests/
```

If any missing, stop. Tell user to run `/review-uc` and `/compliance-pack` first.

## Step 3 — Verify signatures collected

Read `docs/use_cases/{uc}/compliance_pack/signatures_required.md`. Look for unchecked items. If any are unchecked:

```
The following signatures are still required:
  - [ ] {item}
  - [ ] {item}

Cannot promote until all required signatures are collected.
Update signatures_required.md with names, dates, and roles for each sign-off.
```

Stop. Don't proceed without sign-offs.

## Step 4 — Run /review-uc one more time

Invoke the review-uc skill internally. Verdict must be READY. If anything is FAIL or WARN, stop and report.

## Step 5 — Provision ephemeral preview environment

```bash
# Spin up isolated GCP project for this PR/promotion
bash ${CLAUDE_PLUGIN_DIR}/scripts/provision_preview.sh {uc}

# Returns PROJECT_ID like: preview-{uc}-{git_sha}
```

If `GCP_PROJECT_PREVIEW_TEMPLATE` env var isn't set, skip this step but warn user.

## Step 6 — Deploy to preview

```bash
cd infra/environments/preview
terraform init
terraform apply -var="project_id=$PROJECT_ID" -var="use_case={uc}" -auto-approve

# Wait for services to be healthy
bash ${CLAUDE_PLUGIN_DIR}/scripts/wait_for_healthy.sh $PROJECT_ID {uc}
```

## Step 7 — Run L2 e2e suite for this use case

```bash
PREVIEW_GCP_PROJECT=$PROJECT_ID pytest usecases/{uc}/tests/ -v --maxfail=1
```

If any e2e test fails, stop and tear down preview. Report failures clearly.

## Step 8 — Cross-impact analysis

Delegate to cross-impact-analyzer subagent:

```
Use the cross-impact-analyzer subagent to identify use cases impacted
by changes in this promotion. Read all dependencies.yaml files. Output
the list of impacted use case IDs.
```

Capture the list. For each impacted UC:

```bash
PREVIEW_GCP_PROJECT=$PROJECT_ID pytest usecases/{impacted_uc}/tests/ -v --maxfail=1
```

Stop if any fail.

## Step 9 — Run synthetic load (L5)

```bash
bash ${CLAUDE_PLUGIN_DIR}/scripts/synthetic_load.sh \
  --use-case {uc} \
  --project $PROJECT_ID \
  --duration 300 \
  --pattern "production-like"
```

The runner generates traffic matching production patterns for 5 minutes. Asserts:

- P50 / P95 / P99 latency within SLO budget (from `slos.yaml`)
- Error rate within budget
- Decision distribution within drift threshold of baseline
- Agent cost per decision within budget
- All transactions have complete OTel traces
- All decisions have audit log rows

Read the report at `/tmp/synthetic_load_report_{uc}.json`. Verify all assertions passed.

## Step 10 — Tear down preview

```bash
cd infra/environments/preview
terraform destroy -var="project_id=$PROJECT_ID" -auto-approve
gcloud projects delete $PROJECT_ID --quiet
```

Always tear down. Even if previous steps failed.

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
- Trigger: any SLO breach during canary or post-deploy
- Mechanism: Cloud Workflows traffic split → 0% to new version
- Time to rollback: < 2 minutes
- Data implications: stateless services, no migrations required (or list migrations)
```

## Step 12 — Final report to user

```
✓ Use case {uc} is READY FOR PRODUCTION

Promotion report: docs/use_cases/{uc}/promotion_report_{date}.md

Next steps:
  1. Open PR to main with this promotion report attached
  2. Get final approval from {approver role}
  3. Merge — this triggers the production deploy pipeline
  4. Monitor canary at the dashboard: {URL}
  5. Full ramp authorized after 24 hours of clean canary

If canary breaches any SLO:
  - Auto-rollback fires within 2 minutes
  - Investigate via /replay-incident <context_id>
  - Address root cause
  - Re-run /promote
```

## Anti-patterns to refuse

- Promoting without all signatures (refuse, list missing)
- Promoting with failing e2e tests (refuse, show failures)
- Promoting with synthetic load SLO violations (refuse, show metrics)
- Bypassing the cross-impact analysis (refuse — it catches the failure modes that matter most)
- Skipping the preview environment deploy (refuse — production-like testing isn't optional)
