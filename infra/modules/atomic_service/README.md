# atomic_service

Standard Cloud Run module for an atomic service in the FSI agentic banking platform.

## What it provisions

- A dedicated `google_service_account` per service (least privilege).
- A `google_cloud_run_v2_service` with:
  - private-only ingress by default (`INGRESS_TRAFFIC_INTERNAL_ONLY`)
  - VPC access via the bank's serverless connector (Cloud SQL on private IP)
  - DB password via Secret Manager (never plaintext)
  - OTel exporter env var
  - all five bank-policy labels
- IAM bindings: `cloudtrace.agent`, `logging.logWriter`, `cloudsql.client` on the project; `secretAccessor` on the DB password secret.

## Usage

```hcl
module "dscr_calculator" {
  source = "../../infra/modules/atomic_service"

  name        = "dscr-calculator"
  description = "Compute Debt Service Coverage Ratio under base + stressed scenarios."
  project     = var.project
  region      = var.region
  image_uri   = var.images.dscr_calculator

  vpc_connector                       = data.terraform_remote_state.shared.outputs.vpc_connector_id
  cloud_sql_instance_connection_name  = data.terraform_remote_state.shared.outputs.cloud_sql_instance_connection_name
  db_password_secret                  = data.terraform_remote_state.shared.outputs.db_password_secret_id

  use_case            = "credit-memo-commercial"
  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"

  otel_collector_endpoint = var.otel_collector_endpoint
}
```

## Conventions enforced

- **No public IP**. The default ingress + private-only egress means external traffic cannot reach the service unless caller is in the same VPC, in an internal LB, or another Google service (Pub/Sub, Workflows).
- **Auth required**. The module does NOT grant `roles/run.invoker` to `allUsers` — every caller must present an OIDC token.
- **CMEK-aware**. Cloud SQL it talks to must be CMEK-encrypted (enforced by `policies/encryption.rego` against the SQL instance).
- **No plaintext secrets**. `DB_PASS` is mounted from Secret Manager only.
- **Tags**. The five required labels are mandatory inputs; missing or invalid `data_classification` fails the apply.

## Outputs

| Output | Use |
|---|---|
| `name` | Cloud Run service short name. |
| `url` | The service URL (auth required). |
| `service_account_email` | Used by the workflow SA's `run.invoker` binding. |
| `service_account_id` | Full resource ID. |
| `location` | Region. |
