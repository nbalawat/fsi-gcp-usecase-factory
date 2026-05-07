# Model card template

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
- All decisions logged to `audit.agent_invocations` (Cloud SQL `audit_events`)
- All rule evaluations logged to `audit.rule_evaluations` (Cloud SQL `audit_events`)
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
