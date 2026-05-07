---
name: new-use-case
description: Scaffold a new banking use case end-to-end → diagnostic → console pattern → reuse audit → REASONS canvas → 5-step scaffold (handler, atomic services, rules, agent, sinks) → Terraform → tests.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, terraform:*, gcloud:*, pytest:*, ruff:*, mypy:*, npm:*, yarn:*)
---

<!-- EXCEPTION: oversize body tracked in KNOWN_ISSUES.md; v0.1.2 split planned per Sprint-0 audit -->


You are scaffolding a new agentic banking use case.

This is the most important command in the plugin. Take your time. Follow the steps in order. Do not skip diagnostic questions. The user's answers determine what gets built.

## Step 1 — Read the project context

Before anything else:

1. Read `CLAUDE.md` at the repo root. Confirm the 5-step paradigm and constraints.
2. Read `reference/architecture.md` and `reference/console_reference.md` from the plugin to refresh the methodology.
3. Run `ls services/atomic/` to inventory existing atomic services. Run `ls rules/` to inventory existing JDM artifacts. Run `ls agents/` to inventory existing agents.

If the repo is not yet initialized for use case work, stop and tell the user to run `/init-use-case` first.

## Step 2 — Diagnostic questions

Ask the user, one at a time, waiting for each answer:

1. **What is the use case?** Get a one-sentence description. Example: "Detect structuring patterns in cash deposits and draft SAR filings."
2. **What is the trigger event?** Specifically: what event causes the workflow to start? Example: "A cash deposit transaction lands in `payments.received`." If multiple, list them all.
3. **What is the desired outcome?** What does success look like? Example: "A SAR draft is filed with FinCEN within 30 days of detection, after BSA officer approval."
4. **Who is the primary human user?** Example: "BSA officer reviewing SAR drafts." If multiple, identify the *primary* operator.
5. **What regulatory frameworks apply?** Example: "BSA, FinCEN advisories, OFAC."
6. **What's the latency budget?** Sub-second / minutes / hours / days. This determines the console pattern.

## Step 3 — Pick the console pattern

Based on the answers, propose a console pattern using the diagnostic from `reference/console_reference.md`:

- Sub-second + volume-dominant → **Real-time console**
- Investigation against regulatory clock → **Investigations console**
- Multi-day flow through stages → **Pipeline console**
- Continuous re-evaluation of positions → **Surveillance console**
- Periodic exercise toward deadline → **Run console**
- Agent generating suggestions for humans → **Recommendations console**

Tell the user: "This use case fits the {console} console pattern because {reasoning}." Confirm before proceeding. If they push back, walk through the alternatives.

## Step 4 — Inventory reusable assets

Before generating anything, search the existing platform for reuse:

```
For each atomic service candidate (e.g., "OFAC screen", "DTI calc", "ISO 20022 normalize"):
  - Glob services/atomic/*/manifest.json
  - Read each manifest's description
  - Identify matches
```

Output a table to the user:

```
Atomic services to reuse:
  - services/atomic/ofac-screen     (matches OFAC requirement)
  - services/atomic/velocity-check  (matches structuring detection)

Atomic services to create:
  - structuring-pattern-scorer
  - beneficial-owner-resolver

JDM rules to reuse:
  - rules/regulatory_thresholds.json (CTR threshold)

JDM rules to create:
  - rules/structuring_detection.json

Sinks to reuse:
  - services/sinks/email
  - services/sinks/case-management

Sinks to create:
  - services/sinks/fincen-efiling
```

Confirm with user before creating new ones.

## Step 5 — Decide on inner agent workflow

Ask: does this use case need a multi-agent inner workflow, or a single-step agent?

Multi-agent (use the supervisor pattern from `adk-agent-design` skill) when:
- Different specialist models are needed (e.g., Gemini Flash for classification + Claude Opus for narrative)
- Specialists need to retry/refine based on intermediate results
- Output requires synthesis across heterogeneous sub-tasks
- Memory naturally scopes to one inner workflow run

Single-step (one ADK agent in the workflow) when:
- One model call is sufficient
- The agent's output is structured and final
- No internal reasoning loops are needed

Examples:
- Mortgage origination → multi-agent (classifier + extractor + eligibility + memo)
- Payment fraud gray-zone → single agent (one risk score)
- BSA/AML SAR → multi-agent (triage + entity resolution + narrative)

## Step 6 — Identify HITL pattern

Pick the human interaction pattern(s) for this use case from `reference/methodology.md`:

1. **Ambient** — agent runs autonomously, humans see logs only
2. **Notify and continue** — agent acts, human is informed after
3. **Approval gate** — workflow pauses for human disposition
4. **Collaborative copilot** — human drives, agent assists in real time
5. **Conversational** — natural language multi-turn

Most use cases use 2-3 patterns. Tell user which apply and why.

## Step 7 — Generate the directory structure

Create:

```
usecases/{use_case_id}/handler/
  main.py                  (use handler-design skill template)
  Dockerfile
  pyproject.toml
  service.tf
  tests/test_main.py

services/atomic/{new_service_name}/  (one per new atomic service)
  main.py                  (use atomic-service-design skill template)
  manifest.json            (MCP manifest)
  Dockerfile
  pyproject.toml
  service.tf
  tests/test_main.py

usecases/{use_case_id}/agents/
  agent.py                 (use adk-agent-design skill template)
  prompts/                 (one .md file per agent in inner workflow)
  manifest.yaml            (A2A manifest, model selection)
  tests/eval.py
  tests/golden/            (golden test cases)
  tests/adversarial/       (prompt injection tests)

usecases/{use_case_id}/workflow.yaml  (use workflow-design skill template)

rules/{new_rule_name}.json    (one per new JDM rule)

usecases/{use_case_id}/tests/
  test_e2e.py              (full integration suite scaffold)

usecases/{use_case_id}/infra/{use_case_id}.tf  (Terraform module instantiation)

docs/use_cases/{use_case_id}/
  spec.md                  (one-page use case specification)
  dependencies.yaml        (consumes and produces)
  slos.yaml                (latency, error rate, decision distribution)
  compliance_pack/
    model_card.md
    decision_rationale.md
    audit_trail_spec.md
    sr_11_7_documentation.md

ui/use_cases/{use_case_id}/
  config.json              (configures the chosen console pattern)
```

For each file generated, populate from the appropriate skill's template directory (e.g., `${CLAUDE_PLUGIN_DIR}/skills/handler-design/template/`).

## Step 8 — Delegate to specialist subagents

In sequence:

1. **terraform-author** — generate Terraform for all new resources using bank modules
2. **test-author** — generate unit tests, contract tests, e2e test scaffold
3. **prompt-author** — generate initial agent prompts based on the use case description (these are starting points the user will refine)

For each delegation:

```
Use the {agent-name} subagent to {specific task}. Pass {relevant context}.
```

## Step 9 — Run validation

After all files are generated, run:

```bash
# Static checks on Python
ruff check usecases/{use_case_id}/handler/ services/atomic/{new_services}/ usecases/{use_case_id}/agents/
ruff format --check ...
mypy --strict ...
pytest tests/ -x

# Terraform validation
terraform fmt -check usecases/{use_case_id}/infra/{use_case_id}.tf
terraform validate infra/

# JDM lint
bash ${CLAUDE_PLUGIN_DIR}/scripts/jdm_lint.sh rules/{new_rule_files}

# Workflow YAML lint
bash ${CLAUDE_PLUGIN_DIR}/scripts/workflow_lint.sh usecases/{use_case_id}/workflow.yaml

# Bank policy check
conftest test --policy ${CLAUDE_PLUGIN_DIR}/policies/ usecases/{use_case_id}/infra/{use_case_id}.tf
```

Abort and report to user if any fail. Do not declare done with a failing build.

## Step 10 — Architecture audit

Delegate to the architecture-auditor:

```
Use the architecture-auditor subagent to review the new use case at:
  usecases/{use_case_id}/handler/
  services/atomic/{new_services}/
  usecases/{use_case_id}/agents/
  usecases/{use_case_id}/workflow.yaml
  rules/{new_rules}/
  usecases/{use_case_id}/infra/{use_case_id}.tf
  docs/use_cases/{use_case_id}/

Report verdict and any violations.
```

## Step 11 — Generate the use case spec document

Write `docs/use_cases/{use_case_id}/spec.md` containing:

- One-paragraph description
- Trigger events
- 5-step decomposition (handler, atomic services, rules, agent, sinks)
- Console pattern chosen and why
- HITL patterns chosen and why
- Models used and why
- Regulatory frameworks
- Initial SLO budget
- Open questions / TODOs the human team needs to answer

## Step 12 — Final report

Output a concise summary to the user:

```
✓ Use case scaffolded: {use_case_id}
  Console pattern: {pattern}
  Services reused: {N}
  Services created: {M}
  Rules created: {K}
  Inner agent workflow: {yes/no, with N agents}
  HITL patterns: {list}

✓ Validation: PASS
✓ Architecture audit: PASS / N warnings

Next steps for the human team:
  1. Fill in business logic in {service_files}
  2. Author actual JDM rules in {rule_files} (Open in GoRules editor)
  3. Refine agent prompts in usecases/{use_case_id}/agents/prompts/
  4. Populate golden test set in usecases/{use_case_id}/agents/tests/golden/
  5. Run /review-uc when ready for promotion review
  6. Run /compliance-pack when MRM submission is needed
```

## Anti-patterns to refuse

If at any point the user asks for something that violates the methodology:

- A use case that doesn't follow the 5-step paradigm → STOP, explain why, propose decomposition
- A custom UI outside the six console patterns → STOP, ask which pattern fits
- A model other than Claude Opus 4.7 or Gemini 3.1 Flash → STOP, ask for justification
- An atomic service that calls another atomic service → STOP, propose moving the orchestration to the workflow
- An agent that calls external APIs directly → STOP, propose an MCP tool wrapper

Never silently violate the methodology. Always surface the conflict.
