# bigtable_memory_cluster — Memory Bank backing store for ADK agents.
#
# One cluster shared across all use cases. Per-use-case namespacing happens
# at the row-key level (see fsi-adk-patterns SKILL.md).

locals {
  labels = {
    component           = "memory_bank"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = "confidential"
  }
}

resource "google_bigtable_instance" "memory" {
  name                = var.instance_id
  project             = var.project
  deletion_protection = var.deletion_protection
  labels              = local.labels

  cluster {
    cluster_id   = var.cluster_id
    zone         = var.zone
    num_nodes    = var.num_nodes
    storage_type = "SSD"
    kms_key_name = var.kms_key_name != "" ? var.kms_key_name : null
  }
}

# Memory namespace tables — one per memory_scope used by any agent.
resource "google_bigtable_table" "memory_tables" {
  for_each      = toset(["borrower_id", "customer_id", "case_id", "session_id"])
  name          = "memory_${each.value}"
  project       = var.project
  instance_name = google_bigtable_instance.memory.name
}
