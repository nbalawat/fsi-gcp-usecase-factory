# prod environment

Production environment. Hardened defaults; CMEK is mandatory; destruction is explicitly gated.

## Differences from dev/staging

| Setting | dev | staging | prod |
|---|---|---|---|
| Memory Bank nodes | 1 | 2 | 3 |
| `deletion_protection` | false | true | true |
| Trace sampling | 100% | 100% | **10%** |
| `kms_key_name` | optional | optional | **required** (Terraform validation block fails apply if empty) |

## Apply order

```bash
# 1. Shared (one-time)
cd infra/shared && terraform apply -var-file=prod.tfvars

# 2. Env-level (this directory)
cd ../prod && terraform init && terraform apply

# 3. Per UC, after /promote returns READY
cd ../../usecases/<uc>/infra && terraform apply -var-file=prod.tfvars
```

## Prod-specific guards

- `kms_key_name` validation: applies fail if not supplied.
- `deletion_protection = true` on Bigtable + Cloud SQL.
- `trace_sampling_ratio = 0.1` (10%) — bank-policy default to keep trace egress cost bounded; per-UC overrides allowed via the workflow's OTel exporter env var.

## Remote state

Backed by `gs://agentic-experiments-tfstate/fsi-banking/prod` once the GCS backend is provisioned. The `backend "gcs"` block in providers.tf is currently commented; uncomment + run `terraform init -migrate-state` to switch.

## Destruction

`terraform destroy` will refuse on every protected resource. To genuinely tear down prod (rare), the operator must:

1. Open a CR with risk + compliance approval.
2. Set `deletion_protection = false` via PR (architecture-auditor still blocks this on master without the CR ref).
3. Apply the change.
4. Run `terraform destroy`.
5. Restore `deletion_protection = true` immediately.

This deliberate friction is the bank's operating standard.
