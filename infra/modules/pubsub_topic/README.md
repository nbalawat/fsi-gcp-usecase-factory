# pubsub_topic

Pub/Sub topic with optional schema, CMEK, retention, and bank-policy labels.

## Usage

```hcl
module "enriched" {
  source = "../../infra/modules/pubsub_topic"

  name    = "credit-memo-commercial.enriched"
  project = var.project

  kms_key_name        = var.cmek_key
  data_classification = "confidential"
  use_case            = "credit-memo-commercial"
  owner               = "credit-platform"
  cost_center         = "cc-credit-001"

  schema_id          = "credit-memo-commercial.enriched-v1"
  schema_definition  = file("${path.module}/../../schemas/credit_memo_enriched.avsc")
}
```

## Conventions enforced

- **CMEK required for confidential / restricted.** The module fails the apply if `data_classification` is `confidential` or `restricted` and no `kms_key_name` is supplied.
- **7-day retention default.** Regulatory replay window. Override only with explicit justification.
- **Schema enforcement** when `schema_id` is set — invalid messages are rejected at publish time.
