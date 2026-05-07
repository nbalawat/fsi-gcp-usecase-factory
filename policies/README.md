# Policies

OPA / Conftest policies the plugin enforces against generated Terraform and JDM artifacts.

## Files

| File | Purpose |
|------|---------|
| `mcp_manifest_schema.json` | JSON Schema for atomic service MCP manifests |
| `jdm_schema.json` | JSON Schema for GoRules Zen JDM artifacts |
| `iam.rego` | IAM least-privilege rules for Terraform |
| `encryption.rego` | CMEK requirement on customer data storage |
| `networking.rego` | Internal-only ingress, no public DB IPs |
| `observability.rego` | OTel wiring required on Cloud Run services |
| `tagging.rego` | Required labels on all resources |

## Status

This is v0.1.0. Policies are minimal but functional. The platform team extends them as the bank's standards mature.

## Usage

```bash
conftest test --policy policies/ usecases/<my_uc>/infra/<my_uc>.tf
```

Skills invoke `scripts/policy_check.sh` which runs conftest against generated Terraform.
