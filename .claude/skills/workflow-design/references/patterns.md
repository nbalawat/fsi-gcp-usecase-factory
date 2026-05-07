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

