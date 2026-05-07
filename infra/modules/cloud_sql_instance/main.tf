# cloud_sql_instance — POSTGRES_15 instance, private IP only, CMEK-aware,
# deletion_protection on by default, with the bank's required labels.
#
# Reuses the same shape as infra/shared/cloud_sql.tf but parameterized for
# multi-environment use.

locals {
  labels = {
    component           = "cloud_sql"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = "restricted"
    environment         = var.environment
  }
}

resource "google_sql_database_instance" "instance" {
  name                = var.name
  database_version    = "POSTGRES_15"
  region              = var.region
  project             = var.project
  deletion_protection = var.deletion_protection

  encryption_key_name = var.kms_key_name != "" ? var.kms_key_name : null

  settings {
    tier              = var.tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"

    user_labels = local.labels

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_id
    }

    disk_autoresize = true
    disk_size       = var.disk_size_gb
    disk_type       = "PD_SSD"

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "prod"
      transaction_log_retention_days = var.environment == "prod" ? 7 : 1
    }
  }
}

resource "google_sql_database" "fsi_banking" {
  name     = "fsi_banking"
  instance = google_sql_database_instance.instance.name
  project  = var.project
}
