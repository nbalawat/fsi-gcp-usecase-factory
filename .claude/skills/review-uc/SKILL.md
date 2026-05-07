---
name: review-uc
description: Run the full review suite on a use case. Invokes architecture-auditor, security-reviewer, test-author (for coverage), and compliance-reviewer subagents. Reports verdicts and required actions before the use case can be promoted. Use before opening PRs and before /promote.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(git:*, ls:*, cat:*, pytest:*, ruff:*, mypy:*, conftest:*)
---

You are running the comprehensive review suite on a use case.

## Step 1 — Identify the use case

If `$ARGUMENTS` is provided, treat it as the use case ID. Otherwise:

1. Run `git diff --name-only main` to find changed files
2. Identify which use case directory contains most changes
3. Confirm with user: "Reviewing use case: {use_case_id}. Correct?"

## Step 2 — Run static checks first (fast feedback)

```bash
# Python
ruff check usecases/{uc}/handler/ services/atomic/ usecases/{uc}/agents/
ruff format --check ...
mypy --strict ...
pytest tests/ -x

# Coverage
pytest --cov=services --cov=agents --cov-report=term-missing tests/
# Require: 90% line coverage on new code

# Terraform
terraform fmt -check usecases/{uc}/infra/{uc}.tf
terraform validate infra/

# Bank policies
conftest test --policy ${CLAUDE_PLUGIN_DIR}/policies/ usecases/{uc}/infra/{uc}.tf
```

If any fail, stop and report. Don't proceed to subagent reviews until static checks are clean.

## Step 3 — Architecture audit

```
Use the architecture-auditor subagent to review use case {uc}.
Check:
  - 5-step paradigm intact
  - Each step in its correct directory
  - No business rules outside services/rules-service or rules/
  - No atomic-to-atomic calls
  - Approved models only
  - Cloud Workflows YAML under 500 lines
  - Frontend uses one of the six console patterns
  - Every agent decision has a corresponding compliance template entry
  - Tests for every layer
  - Terraform follows use_case_template module
```

Capture verdict.

## Step 4 — Security review

```
Use the security-reviewer subagent to review use case {uc}.
Check:
  - No PII in logs (redacting logger used)
  - No secrets in code
  - IAM roles are least privilege
  - Service accounts have only needed permissions
  - VPC service controls configured (if applicable)
  - Model Armor enabled on agent inputs
  - All inputs from external sources are validated
  - Audit log writes are present for all decisions
```

## Step 5 — Compliance pack completeness

```
Use the compliance-reviewer subagent to verify the compliance pack at
docs/use_cases/{uc}/compliance_pack/.
Check:
  - model_card.md exists and is complete
  - decision_rationale.md exists
  - audit_trail_spec.md exists
  - sr_11_7_documentation.md exists (for use cases with model risk)
  - regulatory citations present for all rules
  - HITL pattern documented
  - signature requirements identified
```

## Step 6 — Test coverage review

Verify presence of:

- L1: Contract tests for every atomic service in this use case
- L2: e2e suite at `usecases/{uc}/tests/`
- Rule golden tests at `tests/golden/{rule_name}/`
- Agent eval tests at `usecases/{uc}/agents/tests/eval.py`
- Agent adversarial tests at `usecases/{uc}/agents/tests/adversarial/`

If any are missing or sparse, delegate to test-author subagent to generate.

## Step 7 — Dependency manifest accuracy

Read `docs/use_cases/{uc}/dependencies.yaml`. Compare to actual code:

- Does the workflow consume topics that aren't listed?
- Does the workflow publish to topics that aren't listed?
- Does the agent call atomic services that aren't listed?
- Does the use case write to BigQuery tables that aren't listed?

If discrepancies, fix the manifest. The cross-impact-analyzer relies on this being accurate.

## Step 8 — SLO file completeness

Read `docs/use_cases/{uc}/slos.yaml`. Verify:

- Latency budgets are set (P50, P95, P99)
- Error rate budget is set
- Decision distribution baseline is recorded (or marked as "first-prod-run-pending")
- Agent cost budget is set
- Token budget is set

## Step 9 — Aggregate the report

Build a structured report:

```
Review of use case: {uc}

STATIC CHECKS         {PASS/FAIL}
  ruff:               {result}
  mypy:               {result}
  pytest:             {result, coverage %}
  terraform:          {result}
  conftest policies:  {result}

ARCHITECTURE AUDIT    {PASS/WARN/FAIL}
  {auditor's verdict and any violations}

SECURITY REVIEW       {PASS/WARN/FAIL}
  {security reviewer's verdict and any issues}

COMPLIANCE PACK       {COMPLETE/INCOMPLETE}
  {compliance reviewer's verdict and missing artifacts}

TEST COVERAGE
  Unit/contract:      {coverage %}
  e2e:                {present/absent, N tests}
  Rule golden:        {present/absent, N cases}
  Agent eval:         {present/absent, N cases}
  Agent adversarial:  {present/absent, N cases}

DEPENDENCY MANIFEST   {ACCURATE/STALE}

SLO FILE              {COMPLETE/INCOMPLETE}

OVERALL VERDICT       {READY / NEEDS WORK / BLOCKED}
```

## Step 10 — Required actions

If anything is FAIL or INCOMPLETE, list the required actions:

```
REQUIRED BEFORE PROMOTION:
  1. {specific action}
  2. {specific action}
  ...

RECOMMENDED:
  1. {non-blocking improvement}
  2. ...
```

## Step 11 — Suggest next command

If verdict is READY:
```
Next: run /compliance-pack to regenerate compliance artifacts, then /promote.
```

If NEEDS WORK:
```
Next: address the required actions, then re-run /review-uc.
```

If BLOCKED (architecture or security FAIL):
```
Next: this needs platform team review. Open a discussion at
  internal-git.bank.example.com/platform/discussions
before proceeding.
```
