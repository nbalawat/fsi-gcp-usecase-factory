# handler_service

Step-1 handler module: Cloud Run service + Pub/Sub push subscription + DLQ.

## What it provisions

- Two service accounts:
  - `fsi-handler-<uc>` — the handler's runtime identity.
  - `fsi-handler-<uc>-pubsub` — the identity Pub/Sub uses for OIDC-authenticated push invocations.
- `google_cloud_run_v2_service` with `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` (Pub/Sub-compatible).
- `google_pubsub_subscription` with `push_config.oidc_token` + a `dead_letter_policy`.
- IAM: handler can publish to `next_topic`; Pub/Sub-invoker SA can `run.invoker` the handler.

## Usage

```hcl
module "credit_memo_handler" {
  source = "../../infra/modules/handler_service"

  use_case  = "credit-memo-commercial"
  project   = var.project
  region    = var.region
  image_uri = var.images.handler

  source_topic      = "loans.application.submitted"
  next_topic        = "credit-memo-commercial.enriched"
  dead_letter_topic = "credit-memo-commercial.dlq"

  vpc_connector                      = data.terraform_remote_state.shared.outputs.vpc_connector_id
  cloud_sql_instance_connection_name = data.terraform_remote_state.shared.outputs.cloud_sql_instance_connection_name
  db_password_secret                 = data.terraform_remote_state.shared.outputs.db_password_secret_id

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}
```

## Conventions enforced

- **DLQ is mandatory.** No `max-retry → drop`; failed messages always land in the DLQ for inspection.
- **OIDC-authenticated push.** Pub/Sub presents a Google-signed ID token; the handler validates the audience matches its own URL.
- **Ingress is internal-and-cloud-load-balancing.** Pub/Sub push works because Pub/Sub is a Google service and the handler accepts Google-internal traffic. External internet cannot reach the handler.
- **Two SAs.** The handler and the Pub/Sub invoker are deliberately distinct: if either is compromised the blast radius is bounded.
