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

## Step 2A — Discipline gates (don't-repeat list)

Run every gate from `docs/methodology/product-build-discipline.md`. Each
maps to an incident on a prior use case; failing one means the same bug
is being shipped again.

```bash
# Rule 2 — structured-output agents must set response_schema
python3 scripts/lint_agent_calls.py usecases/{uc}/

# Rule 3 — stub fallbacks must be loud
grep -rn "synthesized.*=.*True" services/orchestrator-* | \
    xargs -I{} sh -c 'grep -L "_write_event.*synthesized" {} && exit 1 || exit 0'

# Rule 4 — no static demo data past day 1
if [[ "$(yq '.discipline_gates.data_source_at_committed' usecases/{uc}/reasons.yaml)" == "true" ]]; then
    grep -r "demo-data/scenarios" usecases/{uc}/ui/ && echo "FAIL: rule 4" && exit 1
fi

# Rules 8, 9 — no json.dumps into user-facing fields
python3 scripts/lint_no_json_in_prose.py usecases/{uc}/

# Rule 10 — no truncation on forensic writes
grep -rnE '\[\:[0-9]{3,}\]' services/orchestrator-*/main.py | \
    grep -E "narrative|text|summary|description" && echo "FAIL: rule 10" && exit 1 || true

# Rule 7 — idempotency guard present
python3 scripts/lint_idempotency_guard.py services/orchestrator-* usecases/{uc}/handler/

# Rule 13 — no setInterval on case-state queries
grep -rnE "setInterval.*fetch.*(/api/cases|/api/audit)" ui/apps/ \
    && echo "FAIL: rule 13" && exit 1 || true

# Rule 14 — defensive UI checks
node scripts/lint_ui_defensive.mjs ui/apps/

# Rule 16 — no Intl.NumberFormat outside lib/format.ts
grep -rnE "new Intl\.NumberFormat" ui/packages/components/ ui/apps/*/components/ \
    && echo "FAIL: rule 16" && exit 1 || true

# Rule 17 — no platform jargon in UI strings
node scripts/test_ui_smoke.mjs --use-case={uc} --check=banned-terms

# Rule 20 — required env vars hard-fail at boot
python3 scripts/lint_assert_env.py services/orchestrator-* usecases/{uc}/handler/

# Rule 21 — long-running services have explicit timeout
python3 scripts/lint_cloud_run_timeout.py usecases/{uc}/

# Rule 24 — orchestrator request-builder is contract-tested against atomic services
pytest services/orchestrator-credit-memo/tests/test_atomic_contracts.py -x  # adapt per-uc

# Rule 25 — enum coercion at boundary
python3 scripts/lint_enum_coercion.py usecases/{uc}/

# Rule 28 — every rule has a gate (self-test on the doc itself)
python3 scripts/lint_lessons_have_gates.py docs/methodology/product-build-discipline.md
```

Failures here BLOCK promotion. If a gate is "aspirational" (the lessons
doc lists it as such), it's tracked but doesn't block.

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
