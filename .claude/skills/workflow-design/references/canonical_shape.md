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

