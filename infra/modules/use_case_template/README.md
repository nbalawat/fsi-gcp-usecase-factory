# use_case_template

Top-level composer module. Each use case's `usecases/<uc>/infra/<uc>.tf` becomes a single ~30-line call into this template instead of 750+ lines of raw resources.

## What it composes

For one use case it provisions:

- 4 standard Pub/Sub topics: `<uc>.enriched`, `<uc>.decided`, `<uc>.approval_events`, `<uc>.dlq`
- N atomic services (one per entry in `var.atomic_services`)
- 1 handler (if `handler_image_uri` is set)
- M sinks (one per entry in `var.sinks`)
- 1 Cloud Workflow (if `workflow_yaml_path` is set)
- The CRITICAL `credit_officer_app_sa → publisher → approval_events` IAM binding (and ONLY this binding — the agent runtime SA cannot publish approvals)

## Usage

```hcl
module "credit_memo_commercial" {
  source = "../../infra/modules/use_case_template"

  use_case    = "credit-memo-commercial"
  project     = var.project
  region      = "us-central1"
  environment = "dev"

  vpc_connector_id                   = data.terraform_remote_state.shared.outputs.vpc_connector_id
  cloud_sql_instance_connection_name = data.terraform_remote_state.shared.outputs.cloud_sql_instance_connection_name
  db_password_secret                 = data.terraform_remote_state.shared.outputs.db_password_secret_id
  kms_key_name                       = var.cmek_key

  source_topic = "loans.application.submitted"

  atomic_services = {
    "financial-spreader" = { image_uri = var.images.financial_spreader, description = "Spread financials." }
    "dscr-calculator"    = { image_uri = var.images.dscr_calculator,    description = "Compute DSCR." }
    # ... 5 more
  }

  handler_image_uri = var.images.handler

  sinks = {
    "gl-posting"          = { image_uri = var.images.gl_posting,          destination_iam_roles = [] }
    "document-store-gcs"  = { image_uri = var.images.document_store_gcs,  destination_iam_roles = ["roles/storage.objectCreator"] }
  }

  workflow_yaml_path     = "${path.module}/../workflow.yaml"
  rules_service_sa_email = data.google_service_account.rules_service.email
  agent_runtime_sa       = module.credit_memo_supervisor.agent_runtime_sa_email
  credit_officer_app_sa  = var.credit_officer_app_sa

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}
```

## Why this matters

Before this module: every use case authors 750+ lines of raw `google_pubsub_topic`, `google_cloud_run_v2_service`, `google_pubsub_subscription`, `google_workflows_workflow`, etc. Every UC re-derives the same patterns; every UC is a place where a bank-policy violation can creep in.

With this module: a use case's IaC is ~30 lines. Bank policy lives in the modules. The only per-UC variation is `atomic_services` + `sinks` + the handler image, plus tags.
