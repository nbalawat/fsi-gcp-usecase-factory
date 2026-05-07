# atomic_service — Cloud Run + dedicated service account + Cloud SQL access
# + Secret Manager access + OTel + bank-policy labels.
#
# This module enforces the bank's standards for atomic services:
#   - private-only ingress by default
#   - --no-allow-unauthenticated (auth required)
#   - Cloud SQL via VPC connector + private IP
#   - DB password via Secret Manager (never plaintext env var)
#   - dedicated SA per service (least privilege)
#   - OTel exporter env var so traces hit the collector
#   - all 5 required labels (use_case, component, owner, cost_center, data_classification)

locals {
  sa_account_id = substr(replace(var.name, "_", "-"), 0, 30)
  labels = {
    use_case            = var.use_case
    component           = "atomic_service"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
  base_env = merge(
    var.extra_env,
    {
      GCP_PROJECT                 = var.project
      INSTANCE_CONNECTION_NAME    = var.cloud_sql_instance_connection_name
      DB_USER                     = "fsi_app"
      DB_NAME                     = "fsi_banking"
      OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_collector_endpoint
    },
  )
}

resource "google_service_account" "service" {
  account_id   = local.sa_account_id
  display_name = "fsi-atomic-${var.name}"
  description  = "Service account for atomic service ${var.name}: ${var.description}"
  project      = var.project
}

# Always-granted roles (least privilege). Order: trace + log + cloudsql + secret.
locals {
  default_roles = [
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
    "roles/cloudsql.client",
  ]
  all_roles = concat(local.default_roles, var.additional_sa_roles)
}

resource "google_project_iam_member" "sa_roles" {
  for_each = toset(local.all_roles)
  project  = var.project
  role     = each.value
  member   = "serviceAccount:${google_service_account.service.email}"
}

# Bind the SA to the DB-password secret so --set-secrets resolves at runtime.
resource "google_secret_manager_secret_iam_member" "db_password_accessor" {
  project   = var.project
  secret_id = var.db_password_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.service.email}"
}

resource "google_cloud_run_v2_service" "service" {
  name     = "fsi-atomic-${var.name}"
  location = var.region
  project  = var.project
  ingress  = var.ingress

  template {
    service_account = google_service_account.service.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.vpc_connector
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.image_uri

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = local.base_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DB_PASS"
        value_source {
          secret_key_ref {
            secret  = var.db_password_secret
            version = "latest"
          }
        }
      }
    }

    timeout                          = "${var.timeout_seconds}s"
    max_instance_request_concurrency = var.concurrency
  }

  labels = local.labels

  depends_on = [
    google_project_iam_member.sa_roles,
    google_secret_manager_secret_iam_member.db_password_accessor,
  ]
}
