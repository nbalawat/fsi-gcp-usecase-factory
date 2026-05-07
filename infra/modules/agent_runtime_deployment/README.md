# agent_runtime_deployment

Provisions an ADK agent's **identity + IAM** surface. The actual binary deployment of the agent to Vertex AI Agent Builder is performed by `fsi-deploy` (uses `gcloud ai agents deploy` against the manifest YAML).

## Why this is identity-only

Terraform doesn't currently model Vertex AI Agent Builder agent deployments well. The agent code is a Python module under `usecases/<uc>/agents/` that the deploy skill packages and ships via the Vertex API. Terraform owns the static IaC surface: the SA, IAM, Memory Bank access. Code + agent config are deployed out-of-band.

## Critical: no self-approval

This module **does not** grant `pubsub.publisher` on `approval_events`. The agent runtime SA must never be able to fabricate an approval and bypass dual control. `credit_officer_app_sa` is the only identity allowed to publish approval events.

`policies/iam.rego` enforces this; `tests/framework/gatekeepers/fixtures/security_reviewer/violation_self_approval/` is a CRITICAL-severity negative fixture that catches violations.

## Usage

```hcl
module "credit_memo_supervisor" {
  source = "../../infra/modules/agent_runtime_deployment"

  use_case        = "credit-memo-commercial"
  agent_name      = "supervisor"
  project         = var.project
  region          = var.region
  manifest_path   = "${path.module}/../agents/manifest.yaml"
  memory_cluster_id = data.terraform_remote_state.shared.outputs.memory_cluster_id
  memory_scope    = "borrower_id"

  mcp_tool_service_account_emails = [
    module.dscr_calculator.service_account_email,
    module.peer_benchmarker.service_account_email,
    # ... etc
  ]

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}
```

## Outputs

- `agent_runtime_sa_email` — the workflow's `run.invoker` binding consumes this. Critically, it's also passed to `cloud_workflow.var.agent_runtime_sa_email`, NOT to `pubsub_topic`'s approval-events publisher binding.
