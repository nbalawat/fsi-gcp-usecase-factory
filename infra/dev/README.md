# dev environment

Env-level shared infrastructure for the dev environment. Run `terraform apply` here AFTER `infra/shared/` and BEFORE any `usecases/<uc>/infra/`.

## Apply order

```bash
# 1. Shared (one-time, per environment lifecycle)
cd infra/shared && terraform init && terraform apply

# 2. Env-level (this directory)
cd ../dev && cp terraform.tfvars.example terraform.tfvars && terraform init && terraform apply

# 3. Per use case
cd ../../usecases/credit-memo-commercial/infra && terraform init && terraform apply
```

## What it provisions

- **OTel collector** (1 Cloud Run service, ~$5-15/mo)
  - Endpoint becomes `OTEL_EXPORTER_OTLP_ENDPOINT` for every atomic service
  - 100% trace sampling in dev for debuggability

- **Memory Bank** (1-node Bigtable, ~$65/mo)
  - Per-scope tables: `memory_borrower_id`, `memory_customer_id`, `memory_case_id`, `memory_session_id`
  - Used by ADK agents that declare a `memory_scope` in their manifest
  - `deletion_protection = false` in dev (safe to tear down)

## Outputs

These are consumed by per-UC Terraform via `terraform_remote_state`:

| Output | Used by |
|---|---|
| `otel_collector_endpoint` | every atomic_service module call |
| `memory_cluster_id` | every agent_runtime_deployment module call |
| `memory_instance_name` | agent runtime queries to memory bank |

## Cost

- OTel collector: ~$5-15/mo (min_instances=1)
- Memory Bank Bigtable: ~$65/mo (1-node SSD)
- Total dev env-level: **~$70-80/mo**

Plus `infra/shared/` (Cloud SQL ~$30/mo, VPC connector ~$10/mo) → ~$110-120/mo for a fully wired dev environment, before any per-UC services (which scale to zero on Cloud Run).
