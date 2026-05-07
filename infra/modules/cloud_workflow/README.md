# cloud_workflow

Cloud Workflows YAML deployment with a dedicated, narrowly-scoped workflow service account.

## Critical IAM rule

This module **does not** include `roles/pubsub.publisher` on the `approval_events` topic — that grant must go to the credit-officer console SA only. The `policies/iam.rego` policy and `tests/framework/gatekeepers/fixtures/security_reviewer/violation_self_approval/` fixture both enforce this.

## Usage

```hcl
module "credit_memo_workflow" {
  source = "../../infra/modules/cloud_workflow"

  use_case      = "credit-memo-commercial"
  workflow_name = "credit-memo-commercial-workflow"
  project       = var.project
  region        = var.region
  source_yaml   = "${path.module}/../workflow.yaml"

  atomic_service_sa_emails = [
    module.financial_spreader.service_account_email,
    module.dscr_calculator.service_account_email,
    # ... etc
  ]
  rules_service_sa_email = data.google_service_account.rules_service.email
  agent_runtime_sa_email = var.agent_runtime_sa

  publish_topic_ids = [
    module.enriched.name,
    module.decided.name,
    module.dlq.name,
    # NOTE: approval_events is intentionally NOT in this list.
  ]

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}
```

## What it provisions

- A dedicated `google_service_account` per use-case workflow.
- Default IAM: `cloudtrace.agent`, `logging.logWriter`, `workflows.invoker`.
- `run.invoker` for each atomic service + the rules-service.
- `aiplatform.user` for the agent runtime (if supplied).
- `pubsub.publisher` on each topic in `publish_topic_ids`.
- The workflow itself, deployed from `source_yaml`.
