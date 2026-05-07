---
name: compliance-pack
description: Generate or regenerate the compliance pack for a use case. Produces SR 11-7 documentation, model card, decision rationale, audit trail spec, signature checklist. Used by MRM submission. Use after the use case is mostly complete and before /promote.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*)
---

<!-- EXCEPTION: oversize body tracked in KNOWN_ISSUES.md; v0.1.2 split planned per Sprint-0 audit -->


You are generating the compliance pack for a use case.

## Why this matters

Banks need formal compliance documentation per SR 11-7 (model risk management) and per use-case-specific regulations (BSA, Reg E, CFPB, etc.). This pack is what compliance and MRM teams review before approving production deployment.

The plugin generates the pack from templates with use-case-specific content. The user (with compliance team) refines and signs off.

## Step 1 — Identify the use case

If `$ARGUMENTS` provides the use case ID, use it. Otherwise infer from current branch / changed files. Confirm with user.

## Step 2 — Read the use case context

Gather:
- `docs/use_cases/{uc}/spec.md` — the use case specification
- `docs/use_cases/{uc}/dependencies.yaml` — dependencies
- `docs/use_cases/{uc}/slos.yaml` — service level objectives
- `usecases/{uc}/agents/manifest.yaml` — agent metadata
- `usecases/{uc}/agents/prompts/*.md` — agent prompts
- `rules/{uc}*/v*.json` — JDM rules
- `usecases/{uc}/handler/main.py` — handler
- `usecases/{uc}/workflow.yaml` — orchestration

Read all. The compliance pack synthesizes from these.

## Step 3 — Identify the regulatory regime

Ask the user (or infer from spec.md):

"Which regulatory frameworks apply to this use case? Examples:
- BSA / FinCEN (for AML, SAR)
- Reg E / Reg Z (for consumer payments, disclosures)
- CFPB (for complaints, fair lending)
- SCRA / FDCPA (for collections)
- SR 11-7 (model risk; applies to most agentic use cases)
- TRID, Fannie/Freddie/Ginnie (for mortgage)
- UCP 600 (for trade finance)
- FFIEC (for regulatory reporting)
- OCC heightened standards"

Different regimes need different artifacts. SR 11-7 is required for any use case where an agent makes consequential decisions.

## Step 4 — Generate the model card

Write `docs/use_cases/{uc}/compliance_pack/model_card.md`:

```markdown
# Model card: {use_case_id}

## Use case
{description from spec}

## Decisions the model makes
{list each decision the agent or rules make, with action enum}

## Model components

### Rules layer (deterministic)
| Rule | Version | Owner | Citation |
|------|---------|-------|----------|
| {rule_name} | {v1.0} | {owner_team} | {regulation} |

### Agent layer (probabilistic)
| Agent | Model | Memory scope | Tools |
|-------|-------|--------------|-------|
| {agent_name} | claude-opus-4-7 | {scope} | {tool list} |

## Inputs
{from the schemas}

## Outputs
{from the schemas}

## Training / fine-tuning
This use case uses the foundation models claude-opus-4-7 and gemini-3-1-flash.
No fine-tuning has been performed. The agent's behavior is shaped by:
- System prompts at usecases/{uc}/agents/prompts/
- MCP tools at services/atomic/{listed}/
- Memory Bank context per scope: {scope}

## Performance metrics
| Metric | Baseline | Target | Threshold |
|--------|----------|--------|-----------|
| Decision accuracy | {%} | {%} | {%} |
| Confidence calibration | {value} | {value} | {value} |
| P50 latency | {ms} | {ms} | {ms} |
| P99 latency | {ms} | {ms} | {ms} |
| Cost per decision | ${} | ${} | ${} |

## Failure modes
| Mode | Detection | Mitigation |
|------|-----------|------------|
| Model timeout | OTel trace | Fallback model: {fallback} |
| Confidence below threshold | Output schema | Auto-route to human queue |
| Tool unavailability | OTel + retries | Configured retries: {N} |
| Prompt injection | Model Armor | Pattern blocklist + content moderation |
| Schema violation | Pydantic | Reject; log; alert |
| Drift | Decision distribution monitor | Alert at {%} drift |

## Observability
- All decisions logged to `audit.agent_invocations` (BigQuery)
- All rule evaluations logged to `audit.rule_evaluations` (BigQuery)
- All workflow executions tracked in Cloud Workflows
- Distributed traces in Cloud Trace via OpenTelemetry
- Context propagation: every event carries `context_id`

## Validation strategy
- Unit tests at {paths}, coverage {%}
- L2 e2e suite at usecases/{uc}/tests/
- Eval cases at usecases/{uc}/agents/tests/golden/, {N} cases
- Adversarial cases at usecases/{uc}/agents/tests/adversarial/, {N} cases
- Synthetic load run before each promotion
- 24-hour canary at 5% before full ramp
- Decision distribution monitor with auto-rollback on drift
```

## Step 5 — Generate the decision rationale document

Write `docs/use_cases/{uc}/compliance_pack/decision_rationale.md`:

For each decision the agent or rules make, generate:

```markdown
## Decision: {decision_name}

**What it decides:** {description}

**Decision authority:** {rules | agent | rules-then-agent | human}

**For deterministic decisions (rules):**
- Rule: {rule_name} v{version}
- Logic: {summary in plain English}
- Threshold sources: {regulation | board approval | policy doc}
- Approver: {team / committee}

**For agent decisions:**
- Agent: {agent_name}
- Model: {model}
- Inputs the agent considers: {list}
- Tools the agent calls: {list with purpose}
- Reasoning pattern: {chain-of-thought / multi-step / supervised}
- Confidence threshold for auto-decision: {value}
- Below threshold: route to {human role}

**Safety mechanisms:**
- {list of constraints, refusals, escalations}

**Audit trail:**
- Every decision records: {fields}
- Retention: {period}
- Replay capability: yes via /replay-incident
```

## Step 6 — Generate the audit trail spec

Write `docs/use_cases/{uc}/compliance_pack/audit_trail_spec.md`:

```markdown
# Audit trail specification: {use_case_id}

## What gets logged

### Per workflow execution
- workflow_run_id (Cloud Workflows execution ID)
- context_id (transaction / case / application ID)
- start_time, end_time
- final_action
- All step outcomes

### Per rule evaluation
- evaluation_id
- context_id
- rule_name + version
- input payload (schema-validated, redacted as needed)
- output: action, reasons, full trace
- evaluator: rules-service version
- timestamp

### Per agent invocation
- invocation_id
- context_id
- agent_id + version
- model used
- input
- output
- tool calls made (each with input + output)
- token counts (input, output)
- duration_ms
- confidence
- timestamp

### Per human action
- action_id
- context_id
- user_id (Agent Identity SVID)
- action_type (approve, edit, reject, defer)
- diff (what they changed)
- justification (free text)
- timestamp

## Storage
- BigQuery dataset: `audit`
- Tables: `workflow_executions`, `rule_evaluations`, `agent_invocations`, `human_actions`
- Retention: 7 years (banking regulatory requirement)
- Encryption: CMEK
- Access: read-only for auditors via approved IAM role

## Replay
Run `/replay-incident {context_id}` to reconstruct the full causal trace.

## Compliance attestations
This audit trail satisfies:
- SR 11-7 model risk monitoring requirements
- {regulation-specific requirements}
- Bank's internal audit retention policy
```

## Step 7 — Generate SR 11-7 documentation

If the use case has agent decisioning, generate `docs/use_cases/{uc}/compliance_pack/sr_11_7_documentation.md`:

```markdown
# SR 11-7 model risk management: {use_case_id}

## Model identification
- Model owner: {team}
- Model purpose: {description}
- Model components: rules + agents (see model_card.md)
- Model classification: {high | medium | low risk based on consequence}

## Conceptual soundness
{Explanation of why this approach is appropriate for the decision}

## Process verification
- Code review: PR-based, requires platform team approval
- Architecture audit: automated via plugin's architecture-auditor
- Compliance review: this document, reviewed by {team}

## Outcomes analysis
- Performance metrics tracked: {list}
- Drift monitoring: enabled, threshold {%}
- Periodic re-validation: {frequency}

## Limitations and uncertainty
{Honest assessment of what the model can and can't do}
{What would cause it to fail}
{Sensitivity to input quality}

## Independent validation
- Validation status: {pending | in-review | approved | requires-revalidation}
- Validation team: {team}
- Last validated: {date}
- Next validation due: {date}

## Ongoing monitoring
- Daily: error rates, latency budgets
- Weekly: decision distribution, drift signals
- Monthly: agent prompt review, eval set updates
- Quarterly: full re-validation
- Annually: regulatory examination preparation

## Materiality
{If this model affects {N} decisions per period worth ${X}, materiality is {classification}}

## Sign-offs required
- Model owner: {team}
- Independent validator: {team}
- Risk committee (if material): {committee}
- Chief Risk Officer (if high-risk): yes/no
```

## Step 8 — Generate the signature checklist

Write `docs/use_cases/{uc}/compliance_pack/signatures_required.md`:

```markdown
# Signatures required: {use_case_id}

Before this use case can be promoted to production, the following sign-offs must be obtained:

## Engineering
- [ ] Platform team architectural approval
- [ ] Security team review
- [ ] SRE readiness review (runbook complete, alerts configured)

## Risk and compliance
- [ ] Model owner sign-off (model_card.md reviewed)
- [ ] Independent model validator sign-off (sr_11_7_documentation.md reviewed)
- [ ] Compliance team sign-off ({regulation-specific reviews})

## Use-case-specific (per regulation)
{Add specific sign-offs based on regulatory regime, e.g.:}
- [ ] BSA officer (for AML/SAR use cases)
- [ ] Privacy officer (for use cases handling PII at scale)
- [ ] CCO (for high-risk consumer-facing decisions)

## Risk committee
- [ ] Risk committee approval (required if materiality is high)

## Final
- [ ] CRO awareness (for high-risk; not required for medium/low)

Each sign-off should be recorded with name, date, role, and any conditions.
```

## Step 9 — Generate the regulatory citations index

Write `docs/use_cases/{uc}/compliance_pack/regulatory_citations.md`:

For each rule and each agent decision, list the regulatory citation:

```markdown
# Regulatory citations: {use_case_id}

## Rules
| Rule | Citation | Effective date |
|------|----------|----------------|
| {rule_name} | {citation} | {date} |

## Agent decisions
| Decision | Underlying regulation | Notes |
|----------|----------------------|-------|
| {decision} | {citation} | {context} |

## Internal policies
| Reference | Owner | Last reviewed |
|-----------|-------|---------------|
| {policy} | {owner} | {date} |
```

## Step 10 — Report

```
✓ Compliance pack generated: docs/use_cases/{uc}/compliance_pack/
  Files:
    - model_card.md
    - decision_rationale.md
    - audit_trail_spec.md
    - sr_11_7_documentation.md (if applicable)
    - signatures_required.md
    - regulatory_citations.md

NEXT STEPS:
  1. Have the model owner review model_card.md and sign off
  2. Submit sr_11_7_documentation.md to MRM team for independent validation
  3. Have compliance review decision_rationale.md
  4. Collect signatures per signatures_required.md
  5. Once signed, run /promote

This pack is a starting point. Compliance and MRM teams will request edits.
That's expected. Iterate.
```

## Anti-patterns to refuse

- Generating sign-offs (only humans sign)
- Skipping SR 11-7 documentation for agent-decisioning use cases
- Fabricating regulatory citations (if the user doesn't know, ask them)
- Generating performance metrics without real measurements (mark as "to be measured")
