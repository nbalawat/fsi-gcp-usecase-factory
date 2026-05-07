# cloud_sql_instance

Cloud SQL PostgreSQL 15 instance — private-IP only, CMEK-aware, with backup config that scales with environment.

## Usage

```hcl
module "fsi_banking_dev" {
  source = "../../infra/modules/cloud_sql_instance"

  name        = "fsi-banking-dev"
  project     = var.project
  region      = var.region
  environment = "dev"

  vpc_id      = google_compute_network.fsi.id
  kms_key_name = var.cmek_key  # optional in dev; required in prod

  owner       = "platform"
  cost_center = "cc-platform-001"
}
```

## Conventions

- POSTGRES_15.
- `availability_type` = REGIONAL in prod, ZONAL elsewhere.
- `deletion_protection` = true by default. Override only with explicit justification.
- `point_in_time_recovery_enabled` = true in prod, false elsewhere.
- Backup retention: 7 days in prod, 1 day elsewhere.
- IPv4 disabled. Private network only — caller must wire up VPC peering separately (see `infra/shared/network.tf`).
- `log_min_duration_statement` = 1000ms — slow query logging on by default.
