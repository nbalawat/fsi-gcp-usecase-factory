# secret

Secret Manager secret + version + IAM accessor binding for one or more service accounts.

## Usage

```hcl
module "third_party_api_key" {
  source = "../../infra/modules/secret"

  secret_id   = "vendor-api-key-dev"
  project     = var.project
  secret_data = var.vendor_api_key

  accessor_sa_emails = [
    module.financial_spreader.service_account_email,
    module.industry_risk_scorer.service_account_email,
  ]

  owner               = "platform"
  cost_center         = "cc-platform-001"
  data_classification = "restricted"
}
```

## Conventions

- Default classification is `restricted` (secrets are sensitive by definition).
- Auto replication (no replica selection — Google chooses).
- Service accounts get `secretmanager.secretAccessor` only — never `secretmanager.admin`.
