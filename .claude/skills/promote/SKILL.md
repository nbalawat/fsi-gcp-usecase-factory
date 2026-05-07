---
name: promote
description: Gate the use case for production deploy → pre-flight + signatures + review + preview deploy + L2 e2e + cross-impact + synthetic load. Refuses if any step fails.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, gcloud:*, terraform:*, jq:*, pytest:*)
---

You are the promotion gate for a use case. Refuse promotion if any step fails. The output is a written promotion report kept in the use case's compliance pack.

## Step 1 — Identify the use case

From `$ARGUMENTS` or current branch. Confirm with user.

## Step 2 — Pre-flight checks

Required artifacts:
- `usecases/{uc}/reasons.yaml` validates against `policies/reasons_schema.json`
- `usecases/{uc}/docs/{spec.md, dependencies.yaml, slos.yaml}` exist
- `usecases/{uc}/compliance/` has all 6 SR 11-7 artifacts (model_card, risk_assessment, audit_trail_spec, regulatory_citations, decision_rationale, signatures_required)
- `usecases/{uc}/handler/`, `usecases/{uc}/agents/`, `usecases/{uc}/workflow.yaml` exist
- `usecases/{uc}/tests/test_e2e.py` exists with ≥1 scenario per outcome
- All atomic services referenced in REASONS exist under `services/atomic/`

If any are missing → refuse with the specific gap.

## Step 3 — Verify signatures collected

Read `usecases/{uc}/compliance/signatures_required.md`. All four roles must be signed:
- Model Owner
- MRM Independent Validator
- Compliance Officer
- Business Owner

Refuse if any are blank or have `_pending_`.

## Step 4 — Run /review-uc one more time

Invoke the `review-uc` skill. It runs architecture-auditor + security-reviewer + compliance-reviewer + test coverage check. Refuse on any BLOCKER / CRITICAL finding.

## Step 5 — Provision ephemeral preview environment

```
scripts/provision_preview.sh {uc} {commit_sha}
```

Creates a short-lived preview project (or sub-project namespace) for end-to-end validation.

## Step 6 — Deploy to preview

```
ENVIRONMENT=preview INSTANCE_CONNECTION_NAME=...:preview \
  scripts/deploy_use_case.sh {uc}
```

All atomic services + handler + sinks deploy to the preview environment.

## Step 7 — Run L2 e2e suite

```
TEST_ENV=preview pytest usecases/{uc}/tests/ -m live -q
```

All scenarios must pass. Refuse otherwise.

## Step 8 — Cross-impact analysis

Run the `cross-impact-analyzer` subagent. It walks `dependencies.yaml` across all UCs and reports which other use cases consume artifacts this UC also produces. Run their e2e suites too if any are flagged impacted.

## Step 9 — Run synthetic load (L5)

```
scripts/synthetic_load.sh {uc} --duration=5m --rps=10
```

Verify p99 latency, error rate, decision distribution match `slos.yaml`. Refuse otherwise.

## Step 10 — Tear down preview

```
scripts/provision_preview.sh {uc} --teardown
```

## Step 11 — Generate promotion report

Read `references/template_promotion_report.md`. Fill in step-by-step results. Write to `usecases/{uc}/compliance/promotion_report_{date}.md`.

Hash the report and record the hash in the audit-events log under a synthetic `promotion` event so the promotion itself is auditable.

## Step 12 — Report

```
{✓ | ✗} promote {uc}
  Pre-flight:        {pass | fail: <reason>}
  Signatures:        {4/4 | pending: <list>}
  Review:            {pass | fail}
  Preview deploy:    {pass | fail}
  L2 e2e:            {N/N pass}
  Cross-impact:      {clean | <list of UCs>}
  Synthetic load:    {p99=<ms>, error=<%>}
  Verdict:           {READY | BLOCKED}
```

If READY: the use case is cleared for prod deploy. The actual prod cutover is a separate operator action — promote does NOT run prod deploys.

## Anti-patterns to refuse

- Promoting without all four compliance signatures.
- Promoting with any BLOCKER from architecture / security / compliance review.
- Skipping cross-impact analysis when other UCs share artifacts.
- Promoting against missing or stale e2e fixtures.
- Promoting straight to prod — preview deploy is mandatory.
