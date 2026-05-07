# sink_adapter

Use-case-specific sink: Cloud Run service + Pub/Sub push subscription + dest-specific IAM.

## Usage

```hcl
module "gl_posting" {
  source = "../../infra/modules/sink_adapter"

  use_case   = "credit-memo-commercial"
  name       = "gl-posting"
  project    = var.project
  image_uri  = var.images.gl_posting

  source_topic       = module.decided.name
  dead_letter_topic  = module.dlq.name

  vpc_connector                      = data.terraform_remote_state.shared.outputs.vpc_connector_id
  cloud_sql_instance_connection_name = data.terraform_remote_state.shared.outputs.cloud_sql_instance_connection_name
  db_password_secret                 = data.terraform_remote_state.shared.outputs.db_password_secret_id

  # GL posting writes to Cloud SQL gl_postings table — no extra dest roles
  destination_iam_roles = []

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}

module "document_store_gcs" {
  source = "../../infra/modules/sink_adapter"

  use_case   = "credit-memo-commercial"
  name       = "document-store-gcs"
  project    = var.project
  image_uri  = var.images.document_store

  source_topic      = module.decided.name
  dead_letter_topic = module.dlq.name

  vpc_connector                      = data.terraform_remote_state.shared.outputs.vpc_connector_id
  cloud_sql_instance_connection_name = data.terraform_remote_state.shared.outputs.cloud_sql_instance_connection_name
  db_password_secret                 = data.terraform_remote_state.shared.outputs.db_password_secret_id

  destination_iam_roles = [
    "roles/storage.objectCreator",  # write memo PDFs to GCS
  ]

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}
```

## Conventions

- **Sinks are idempotent.** Each sink uses `context_id` as a dedup key (handled in service code, not the module).
- **DLQ is mandatory.** Same as `handler_service` — no max-retry-loop without one.
- **Per-sink SA + per-sink Pub/Sub-invoker SA.** Two distinct identities; blast radius is contained.
- **destination_iam_roles** is the variable extension point: GCS sinks need `storage.objectCreator`; BigQuery sinks need `bigquery.dataEditor` on the specific table; etc.
