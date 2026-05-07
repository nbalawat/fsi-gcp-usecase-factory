# infra/shared/cloud_sql.tf
# Shared Cloud SQL PostgreSQL instance — thresholds, audit, GL ledger
# Portable: same schema runs on AWS RDS, Azure PostgreSQL, on-prem
# This is FRAMEWORK infrastructure — every use case uses this one DB.

variable "db_tier"      { default = "db-g1-small" }
variable "db_disk_size" { default = 20 }
variable "vpc_id"       { type = string }
variable "kms_key_name" {
  type    = string
  default = ""
}

resource "google_sql_database_instance" "fsi_banking" {
  name                = "fsi-banking-${var.environment}"
  database_version    = "POSTGRES_15"
  region              = var.region
  project             = var.project
  deletion_protection = true

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_id
    }

    disk_autoresize = true
    disk_size       = var.db_disk_size
    disk_type       = "PD_SSD"

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }
}

resource "google_sql_database" "fsi_banking" {
  name     = "fsi_banking"
  instance = google_sql_database_instance.fsi_banking.name
  project  = var.project
}

# DB password in Secret Manager (never in Terraform state)
resource "google_secret_manager_secret" "db_pass" {
  secret_id = "fsi-banking-db-pass-${var.environment}"
  project   = var.project
  replication { auto {} }
}

# Cloud SQL client access for all atomic service SAs
variable "atomic_service_sa_emails" {
  type    = list(string)
  default = []
}

resource "google_project_iam_member" "sql_client" {
  for_each = toset(var.atomic_service_sa_emails)
  project  = var.project
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

resource "google_secret_manager_secret_iam_member" "db_pass_accessor" {
  for_each  = toset(var.atomic_service_sa_emails)
  secret_id = google_secret_manager_secret.db_pass.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

output "instance_connection_name" {
  value = google_sql_database_instance.fsi_banking.connection_name
}

output "db_pass_secret_id" {
  value = google_secret_manager_secret.db_pass.id
}
