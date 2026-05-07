# infra/shared/cloud_sql.tf
# Shared Cloud SQL PostgreSQL instance — thresholds, audit, GL ledger
# Portable: same schema runs on AWS RDS, Azure PostgreSQL, on-prem
# This is FRAMEWORK infrastructure — every use case uses this one DB.

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier."
  default     = "db-g1-small"
}

variable "db_disk_size" {
  type        = number
  description = "Cloud SQL disk size in GB."
  default     = 20
}

variable "kms_key_name" {
  type        = string
  description = "CMEK key resource name; empty string disables CMEK (Google-managed key only)."
  default     = ""
}

variable "atomic_service_sa_emails" {
  type        = list(string)
  description = "Service account emails that need cloudsql.client and secretmanager.secretAccessor."
  default     = []
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
      private_network = google_compute_network.fsi.id
    }

    disk_autoresize = true
    disk_size       = var.db_disk_size
    disk_type       = "PD_SSD"

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }

  encryption_key_name = var.kms_key_name != "" ? var.kms_key_name : null

  depends_on = [google_service_networking_connection.fsi]
}

resource "google_sql_database" "fsi_banking" {
  name     = "fsi_banking"
  instance = google_sql_database_instance.fsi_banking.name
  project  = var.project
}

# Application user — password is stored in Secret Manager.
resource "random_password" "db_pass" {
  length  = 32
  special = true
}

resource "google_sql_user" "app" {
  name     = "fsi_app"
  instance = google_sql_database_instance.fsi_banking.name
  project  = var.project
  password = random_password.db_pass.result
}

# DB password in Secret Manager (never in Terraform state output).
resource "google_secret_manager_secret" "db_pass" {
  secret_id = "fsi-banking-db-pass-${var.environment}"
  project   = var.project
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_pass" {
  secret      = google_secret_manager_secret.db_pass.id
  secret_data = random_password.db_pass.result
}

# Cloud SQL client access for all atomic service SAs.
resource "google_project_iam_member" "sql_client" {
  for_each = toset(var.atomic_service_sa_emails)
  project  = var.project
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

resource "google_secret_manager_secret_iam_member" "db_pass_accessor" {
  for_each  = toset(var.atomic_service_sa_emails)
  project   = var.project
  secret_id = google_secret_manager_secret.db_pass.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}
