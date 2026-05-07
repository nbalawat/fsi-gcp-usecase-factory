---
name: workflow-design
description: Auto-invoked when files in usecases/<uc>/workflow.yaml are read or edited → design rules for Cloud Workflows YAML orchestrating handler → atomic services → rules → agent → sinks.
---

You are guiding the design of a Cloud Workflows YAML for one use case.

## Hard rules

- The workflow is the **only** place where multiple atomic services are composed. Atomic services NEVER call other atomic services.
- Every workflow follows the canonical 5-step shape: `handler → atomic services → rules → agent → sinks`. Skipping any step is a violation.
- Workflow YAML must be ≤ 500 lines. Decompose into named sub-workflows (`main`, `service_fan_out`, `sink_fanout`) if longer.
- Every step must have explicit `timeout`, `retry` policy, and `next` transition (no implicit fall-through).
- `context_id` propagates through every step in headers AND request bodies.
- Rules-service step is mandatory between atomic-service join and agent call. **Never skip it** — even if the use case "doesn't need" rules, the rules-service returns APPROVE for empty rules and that's still observable.

## The canonical shape

Read `references/canonical_shape.md` for the full template. The workflow always has these named blocks (in this order):

1. `init` — capture context_id, regulatory clock, log start
2. `service_fan_out` (sub-workflow) — call atomic services in parallel, await all
3. `call_rules_service` — POST to rules-service with `service_results`; branch on decision
4. `call_supervisor` — invoke the ADK agent (HTTP call; OIDC token); receive memo
5. `approval_gate` (if HITL pattern is approval-gate) — Cloud Workflows callback
6. `sink_fanout` (sub-workflow) — publish to all use-case sinks in parallel
7. `done` — log completion, emit final metric

DLQ on every fallible step. Idempotency guard on the handler entry.

## Patterns

Read `references/patterns.md` for these reusable shapes (each has a fragment in `libraries/workflows/`):

- `fan-out-join` — call N services in parallel, collect results
- `agent-call-with-retry` — call ADK agent with primary model, fallback to secondary on timeout
- `approval-gate` — pause on Cloud Workflows callback, await human decision, resume or reject
- `regulatory-clock` — start a deadline timer, emit alerts at thresholds
- `dlq-on-failure` — route terminal failures to a DLQ topic
- `sink-fanout` — publish to N sinks atomically

Compose the workflow from fragments rather than authoring raw YAML — `workflow-builder` does the composition automatically based on REASONS Operations.

## Retries and idempotency

- Atomic service calls: `max_attempts=3`, `initial_delay=2s`, `max_delay=15s`, exponential backoff.
- Agent calls: `max_attempts=2` (LLM calls are expensive); fallback to secondary model on timeout.
- Sink publishes: at-least-once; sinks are idempotent (use `context_id` as dedup key).
- Handler: idempotency guard (Firestore key) before any mutation.

## Observability

Every workflow step:
- Has a unique `step_id` for trace correlation
- Sets `context_id` as an OTel span attribute
- Logs start + end with structured logger (never print)
- Emits a metric `workflow_step_duration_ms{step,outcome}`

## context_id propagation

Generated in the handler if not already set. Propagated through every Pub/Sub message, every HTTP header, every audit row, every log line. The whole pipeline is reconstructable from `context_id`.

## Anti-patterns to refuse

- Skipping the rules-service step (4-step instead of 5-step paradigm).
- Workflow YAML > 500 lines without sub-workflow decomposition.
- Atomic-service-to-atomic-service calls inside the workflow (every fan-out joins; never chains).
- Implicit step transitions (every step needs explicit `next`).
- Missing retry / timeout / DLQ on a fallible step.
- Allowing the agent runtime SA to publish to `approval_events` (self-approval risk).
