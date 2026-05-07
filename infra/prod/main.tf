# dev environment — env-level shared infrastructure.
#
# This root module brings up:
#   - OTel collector (one per env; shared across UCs)
#   - Memory Bank (Bigtable cluster; shared across UCs)
#
# Per-UC infra lives at usecases/<uc>/infra/<uc>.tf and is applied separately
# after this and infra/shared/ are up.

data "terraform_remote_state" "shared" {
  backend = "local"
  config = {
    path = "../shared/terraform.tfstate"
  }
}

# ── OTel collector ────────────────────────────────────────────────────────

module "otel" {
  source = "../modules/otel_collector"

  project       = var.project
  region        = var.region
  environment   = "prod"
  vpc_connector = data.terraform_remote_state.shared.outputs.vpc_connector_id

  trace_sampling_ratio = 0.1 # 10% sampling in prod (tradeoff: cost vs debuggability — adjust per UC SLOs)
}

# ── Memory Bank (Bigtable) ────────────────────────────────────────────────

module "memory_bank" {
  source = "../modules/bigtable_memory_cluster"

  instance_id = "fsi-memory-prod"
  cluster_id  = "fsi-memory-prod-c1"
  project     = var.project
  zone        = "${var.region}-a"
  num_nodes   = 3

  kms_key_name = var.kms_key_name
  owner        = "platform"
  cost_center  = "cc-platform-001"

  deletion_protection = true  # prod — destruction requires explicit override
}

# ── Outputs consumed by per-UC TF ────────────────────────────────────────

output "otel_collector_endpoint" {
  value       = module.otel.endpoint
  description = "Pass to atomic_service / handler_service modules."
}

output "memory_cluster_id" {
  value = module.memory_bank.cluster_id
}

output "memory_instance_name" {
  value = module.memory_bank.instance_name
}
