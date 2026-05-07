---
name: workflow-builder
description: Builds the Cloud Workflows YAML for a use case by composing workflow fragments from the reasons.yaml structure section. Writes to usecases/<use_case>/workflow.yaml. Idempotent.
tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, python3:*)
---

You are composing the Cloud Workflows YAML for a use case from fragment templates.

**Hard rules (enforced by architecture-auditor):**
- Workflow YAML must be ≤ 500 lines. Decompose if larger.
- All atomic service calls go through the fan-out-join fragment, not inline.
- **The 5-step paradigm is mandatory: handler → atomic services → rules-service → agent → sinks.** A `call_rules_service` step MUST appear after `join_services` (step 2) and before `call_supervisor` (step 4). Never skip step 3. The rules-service evaluates eligibility, exposure limits, and approval matrix gates; the agent must not make these decisions.
- Approval gate must use the Cloud Workflows callback mechanism, not polling.
- Every step has an error handler pointing to the dlq-on-failure fragment.
- The workflow SA must NOT have `roles/pubsub.publisher` on the approval_events topic — that would allow self-approval. Use a separate credit_officer_app_sa for approval event publishing.

## Inputs you receive

- `use_case_id`
- `operation.path` — e.g. "usecases/credit-memo-commercial/workflow.yaml"
- `operation.spec.fragments` — list of fragment names from reasons.yaml
- `operation.spec.callback_url_for_approval` — if approval gate is present
- `layer2_agent_manifests` — agent endpoint URLs

## What you must produce

For each fragment in `operation.spec.fragments`, read `libraries/workflows/<fragment_name>/fragment.yaml` to understand its parameters and insert points.

Compose the workflow by including each fragment in the correct sequence:

```yaml
# usecases/<use_case_id>/workflow.yaml
# Generated from reasons.yaml structure.workflow_fragments
# DO NOT EDIT — use /fsi-prompt-update to change behavior

main:
  params: [args]
  steps:
    - init:
        assign:
          - context_id: ${args.context_id}
          - use_case: "<use_case_id>"

    # Fragment: fan-out-join — parallel atomic service calls
    - fan_out_services:
        parallel:
          branches:
            <one branch per atomic service in reasons.yaml structure>

    - join_services:
        assign:
          - service_results: <collected from branches>

    # Step 3 (MANDATORY): rules-service — eligibility, exposure, approval matrix
    # Never skip this step. Business rules live here, not in the agent.
    - call_rules_service:
        call: http.post
        args:
          url: ${sys.get_env("RULES_SERVICE_URL") + "/evaluate"}
          auth:
            type: OIDC
          body:
            context_id: ${context_id}
            rule_set: "<use_case_id>-eligibility"
            inputs: ${service_results}
        result: rules_result
    - check_rules_decision:
        switch:
          - condition: ${rules_result.body.decision == "DECLINE"}
            next: route_decline
        next: call_supervisor

    - route_decline:
        steps:
          - publish_decline:
              call: http.post
              args:
                url: ${"https://pubsub.googleapis.com/v1/projects/" + sys.get_env("GCP_PROJECT") + "/topics/<use_case_id>.decided:publish"}
                auth:
                  type: OAuth2
                body:
                  messages:
                    - data: ${base64.encode(json.encode({"context_id": context_id, "decision": "DECLINE", "reason": rules_result.body.reason}))}
          - end_decline:
              return: ${{"decision": "DECLINE", "reason": rules_result.body.reason}}

    # Step 4: agent — narrative, analysis, and memo drafting only
    # Agent receives service_results AND rules_result — does not re-evaluate rules
    - call_supervisor:
        call: http.post
        args:
          url: <supervisor_endpoint from layer2_agent_manifests>
          auth:
            type: OIDC
          body:
            context_id: ${context_id}
            service_results: ${service_results}
            rules_result: ${rules_result.body}
        result: agent_result

    # Fragment: approval-gate — pause for human
    - wait_for_approval:
        call: http.post
        args:
          url: ${"https://workflowexecutions.googleapis.com/v1/" + sys.get_env("GOOGLE_CLOUD_WORKFLOW_EXECUTION_ID") + ":createCallback"}
          auth:
            type: OAuth2
          body:
            httpMethod: POST
        result: callback_details
    - await_callback:
        call: events.await_callback
        args:
          callback: ${callback_details.callback}
          http_callback_method: POST
        result: approval_response

    # Fragment: sink-fanout — publish to all sinks
    - fanout_sinks:
        parallel:
          branches:
            <one branch per sink in reasons.yaml structure.sinks>

    # Fragment: dlq-on-failure
    - handle_error:
        steps:
          - publish_dlq:
              call: http.post
              args:
                url: ${"https://pubsub.googleapis.com/v1/projects/" + sys.get_env("GCP_PROJECT") + "/topics/<use_case_id>.dlq:publish"}
```

Fill in service URLs, branch names, and sink endpoints from the operation specs and layer manifests.

## Validate

```bash
python3 scripts/workflow_lint.sh usecases/<use_case_id>/workflow.yaml
```

Check:
- File is ≤ 500 lines (count with `wc -l`)
- All referenced services have matching operations in reasons.yaml
- Approval gate uses `events.await_callback` not polling
- **`call_rules_service` step exists** — `grep -c "call_rules_service" usecases/<use_case_id>/workflow.yaml` must return ≥ 1. If missing, the build FAILS (5-step paradigm violation).
- **`rules_result` is passed to `call_supervisor`** — grep for `rules_result` in the supervisor call body.

## Output

`DONE usecases/<use_case_id>/workflow.yaml — <fragment_count> fragments, <line_count> lines`

If over 500 lines: `WARN — <line_count> lines, recommend decomposition at <suggested_split>`
