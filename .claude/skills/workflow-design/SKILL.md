---
name: workflow-design
description: Auto-invoked when files in usecases/<uc>/workflow.yaml are read or edited → design rules for Cloud Workflows YAML orchestrating handler → atomic services → rules → agent → sinks.
---

# Cloud Workflows design

The workflow is the deterministic orchestrator that wires the 5 steps together. It is NOT where decisions live — decisions are in rules and agents. The workflow just executes the recipe.

## Hard rules

- Workflow YAML must be under 500 lines. If approaching, decompose into sub-workflows.
- Every step calls a service or branches on a result. No inline logic.
- Every step propagates `context_id` to downstream calls.
- Every step has a timeout (no unbounded waits).
- Every step has a retry policy (idempotent retries are the default).
- Workflows publish to topics; they don't write directly to BigQuery (sinks do that).

## The canonical shape

```yaml
main:
  params: [event]
  steps:
    - init:
        assign:
          - context_id: ${event.context_id}
          - use_case: "{use_case_id}"

    - parallel_atomic_calls:
        parallel:
          shared: [enriched]
          branches:
            - call_atomic_a:
                steps:
                  - call_a:
                      call: http.post
                      args:
                        url: ${atomic_a_endpoint}
                        body: ${event}
                        timeout: 5
                      result: result_a
                  - merge_a:
                      assign:
                        - enriched.field_a: ${result_a.body}
            - call_atomic_b:
                # similar pattern

    - evaluate_rules:
        call: http.post
        args:
          url: ${rules_service_endpoint}
          body:
            rule: "{rule_name}"
            context: ${enriched}
            context_id: ${context_id}
          timeout: 3
        result: rule_outcome

    - branch_on_rule:
        switch:
          - condition: ${rule_outcome.body.action == "clear"}
            next: publish_clear
          - condition: ${rule_outcome.body.action == "decline"}
            next: publish_decline
          - condition: ${rule_outcome.body.action == "gray_zone"}
            next: invoke_agent

    - invoke_agent:
        call: http.post
        args:
          url: ${agent_runtime_endpoint}
          body:
            agent_id: "{use_case}_agent"
            input: ${enriched}
            context_id: ${context_id}
          timeout: 30
        result: agent_outcome
        next: branch_on_agent

    - branch_on_agent:
        switch:
          - condition: ${agent_outcome.body.action == "approve"}
            next: publish_approve
          - condition: ${agent_outcome.body.action == "decline"}
            next: publish_decline
          - condition: ${agent_outcome.body.action == "refer_human"}
            next: route_to_approval_queue

    - publish_clear:
        # publish to outcome topic
    - publish_decline:
        # publish to outcome topic
    - publish_approve:
        # publish to outcome topic
    - route_to_approval_queue:
        # publish to approval queue topic with callback URL
```

## Patterns

### Parallel atomic services
Atomic services are independent. Call them in parallel via `parallel: branches:`. Wait for all to complete, merge results.

### Rules-then-agent
The standard fraud / SAR / dispute pattern: rules first, agent for gray zone only. Saves cost (no agent call when rules are decisive) and latency.

### Approval gate (HITL pattern 3)
Workflow pauses, publishes case to approval queue topic with a callback URL. Workflow stays paused (Cloud Workflows supports this for up to 1 year). When human disposes, callback resumes the workflow with disposition.

```yaml
- route_to_approval_queue:
    call: http.post
    args:
      url: ${approval_queue_endpoint}
      body:
        case: ${enriched}
        agent_recommendation: ${agent_outcome.body}
        callback: ${context.workflow.callback_url}
    result: queue_response

- await_human:
    call: events.await_callback
    args:
      callback: ${context.workflow.callback_url}
      timeout: 86400  # 24h, then escalate
    result: human_decision
```

### Loop with bounded retries
For specialist agents that may need refinement:

```yaml
- attempt_extraction:
    for:
      value: attempt
      in: [1, 2, 3]
      steps:
        - try_extract:
            call: http.post
            args: {...}
            result: result
        - check_complete:
            switch:
              - condition: ${result.body.complete}
                return: result.body
        - try_again:
            # iterate
    next: extraction_failed
- extraction_failed:
    raise: "Extraction failed after 3 attempts"
```

### Sub-workflow decomposition
When a workflow exceeds 500 lines, extract a sub-workflow:

```yaml
# main workflow
- run_underwriting:
    call: googleapis.workflowexecutions.v1.projects.locations.workflows.executions.run
    args:
      workflow_id: "underwriting_inner"
      argument: {...}
    result: underwriting_result
```

## Retries and idempotency

Every external call must:
- Have a timeout
- Have explicit retry policy
- Be idempotent on the server side

```yaml
- call_external:
    call: http.post
    args:
      url: ...
      body: ...
      timeout: 10
    retry:
      predicate: ${http.default_retry_predicate}
      max_retries: 3
      backoff:
        initial_delay: 1
        max_delay: 30
        multiplier: 2
```

## Observability

Every step's result is logged by Cloud Workflows automatically. Plus:
- Add `OTEL_TRACE_CONTEXT` header to all outbound calls (`X-Cloud-Trace-Context`)
- Tag every workflow with `use_case` and `context_id` labels
- Workflow execution ID is the audit anchor

## context_id propagation

Every outbound HTTP call must include `context_id` in body or headers. The receiving service includes it in OTel spans, audit logs, and any downstream calls. This is what makes `/replay-incident` work.

## Anti-patterns to refuse

- Workflows over 500 lines (decompose)
- Inline business logic in workflow (move to rules or agent)
- Steps without timeouts
- Steps without retry policies
- Steps that don't propagate `context_id`
- Workflows that write directly to BigQuery (use sinks)
- Workflows that call external APIs not registered as bank-approved
- Synchronous calls to slow services (use Pub/Sub for async)
- Custom YAML beyond Cloud Workflows spec (no comments-as-logic)
