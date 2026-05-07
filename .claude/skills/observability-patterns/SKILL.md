---
name: observability-patterns
description: Knowledge for instrumenting services, agents, and workflows with the bank's observability conventions. Auto-invoked when code is being written or edited. Covers OpenTelemetry, structured logging, audit log writes, context_id propagation, and the metrics every component must emit.
---

# Observability patterns

Observability is non-negotiable. If the bank can't replay what an agent did, it can't audit, debug, or satisfy regulators. Every component the platform produces is instrumented.

## The three pillars

### 1. OpenTelemetry traces

Every service emits OTel spans. Every agent invocation is a span. Every workflow execution is a trace. Every span carries `context_id`.

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

@app.post("/v1/compute")
async def compute(req: Request) -> Response:
    with tracer.start_as_current_span("atomic.{service_name}.compute") as span:
        span.set_attribute("context_id", req.context_id)
        span.set_attribute("input_size", len(req.payload))
        # ... do work
        span.set_attribute("output_action", result.action)
        return result
```

Span naming convention:
- `handler.{use_case}.{operation}` — handlers
- `atomic.{service_name}.{operation}` — atomic services
- `rules.{rule_name}.evaluate` — rule evaluations
- `agent.{agent_id}.invoke` — agent invocations
- `agent.{agent_id}.tool.{tool_name}` — tool calls within agents
- `sink.{sink_name}.{operation}` — sinks
- `workflow.{use_case}.{step_name}` — workflow steps (auto-emitted by Cloud Workflows)

Required attributes on every span:
- `context_id` — the universal correlation key
- `use_case` — which use case
- `service_version` — for change correlation

### 2. Structured logging

Use the bank's `redacting_logger` (assume it exists in `services/common/`). Never `print()`, never raw `logging.info()` with f-strings containing user data.

```python
from common.redacting_logger import get_logger

logger = get_logger(__name__)

logger.info("decision_made", extra={
    "context_id": ctx,
    "decision": "approve",
    "confidence": 0.92,
    "agent_id": "fraud_v1",
})
```

The redacting logger:
- Outputs JSON to stdout (Cloud Logging picks up automatically)
- Auto-redacts known PII patterns (SSN, account numbers, card numbers)
- Adds `service`, `version`, `environment` automatically

Never log:
- Raw card numbers or account numbers
- SSNs or full taxpayer IDs
- Document contents that contain PII
- Customer names + sensitive context (use customer ID, look up name only when needed)

Always log:
- `context_id` for correlation
- Decision outcomes
- Errors with full traceback
- Tool call inputs/outputs (redacted as needed)

### 3. Audit log writes

Every decision and every human action writes to BigQuery `audit.*` tables. This is the regulatory record.

```python
from common.audit import write_audit

await write_audit("rule_evaluations", {
    "evaluation_id": str(uuid4()),
    "context_id": ctx,
    "rule_name": "structuring_detection",
    "rule_version": "1.0",
    "input": redact(input_payload),
    "output": output,
    "evaluator_version": "rules-service-1.4.0",
    "timestamp": datetime.utcnow(),
})
```

Audit tables:
- `audit.workflow_executions` — every workflow run
- `audit.rule_evaluations` — every rule evaluation
- `audit.agent_invocations` — every agent call (with tokens, cost, tools used)
- `audit.human_actions` — every human disposition
- `audit.tool_calls` — every MCP tool call (for trace replay)

Retention: 7 years (banking regulatory requirement). CMEK encrypted. Read-only IAM for auditors.

## context_id propagation

The single most important rule: every event flowing through the platform carries `context_id` from origination to all destinations.

- Handler receives event → reads or generates `context_id`
- Handler publishes to next topic → message includes `context_id`
- Workflow consumes → passes `context_id` to every service call
- Atomic service → tags OTel span with `context_id`, includes in logs
- Rules service → records `context_id` in `audit.rule_evaluations`
- Agent → tags OTel span and writes to `audit.agent_invocations` with `context_id`
- Tool calls → propagate `context_id` to atomic services
- Sinks → write `context_id` to destination systems where supported

This is what makes `/replay-incident <context_id>` work. Without it, debugging in production is impossible.

## Metrics

Every service emits standard metrics (Cloud Monitoring auto-collects HTTP metrics; add custom):

- `decisions_total{action, agent_id}` — counter of decisions per action
- `latency_seconds{operation}` — histogram of operation durations
- `tool_calls_total{tool, agent_id, status}` — counter
- `tokens_total{model, agent_id, direction}` — counter (input vs output tokens)
- `errors_total{component, error_type}` — counter

These feed dashboards, alerts, and the canary monitor.

## SLO assertions

Every use case's `slos.yaml` declares budgets. The synthetic load runner asserts against them. The canary monitor watches them in production. Breach → auto-rollback.

```yaml
latency:
  p50_ms: 200
  p95_ms: 500
  p99_ms: 1000
error_rate:
  budget_pct: 0.5
decision_distribution:
  baseline: { approve: 0.84, decline: 0.04, gray: 0.12 }
  drift_threshold_pct: 5
```

## Replay capability

The `/replay-incident <context_id>` command reconstructs the full causal chain:
1. Query `audit.workflow_executions` for the workflow run
2. Query `audit.rule_evaluations` and `audit.agent_invocations` for that workflow
3. Query `audit.tool_calls` for all tools invoked
4. Query Cloud Trace for the OTel spans
5. Render a chronological report

This capability isn't built per use case — it's a side-effect of the discipline above. Enforce the discipline; replay just works.

## Anti-patterns to refuse

- Services without OTel spans
- Spans without `context_id` attribute
- Logs without `context_id`
- `print()` in production code
- Raw PII in logs
- Decisions not written to audit tables
- Missing audit fields (`rule_version`, `agent_version`, `model`)
- Hard-coded log destinations (use the structured logger)
