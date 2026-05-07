# bigtable_memory_cluster

Memory Bank backing store for ADK agents — one cluster per environment, shared across all use cases.

## Why one cluster

Memory Bank's per-scope namespacing is row-key-based. A single Bigtable instance with four tables (`memory_borrower_id`, `memory_customer_id`, `memory_case_id`, `memory_session_id`) supports every use case's memory scope choice without per-UC infra.

## Usage

```hcl
module "memory_dev" {
  source = "../../infra/modules/bigtable_memory_cluster"

  instance_id = "fsi-memory-dev"
  cluster_id  = "fsi-memory-dev-c1"
  project     = var.project
  zone        = "us-central1-a"
  num_nodes   = 1

  kms_key_name = var.cmek_key
  owner        = "platform"
  cost_center  = "cc-platform-001"
}
```

## Production sizing

- `num_nodes` = 3+ for prod (handles regional failover).
- `kms_key_name` mandatory for prod (regulatory requirement).
- Consider `availability_type=REGIONAL` cluster config for prod via the cluster argument (currently zone-pinned for dev simplicity).
