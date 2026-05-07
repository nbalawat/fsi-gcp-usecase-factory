# sink_adapter — Cloud Run sink + Pub/Sub push subscription + DLQ
# + dest-specific IAM. The sink consumes the use case's decided topic and
# writes to a downstream destination (GCS, GL ledger, document store, etc.).

locals {
  service_name = "fsi-sink-${var.name}"
  sa_account   = substr("fsi-sink-${var.name}", 0, 30)
  pubsub_sa    = substr("fsi-sink-${var.name}-ps", 0, 30)
  labels = {
    use_case            = var.use_case
    component           = "sink"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
  base_env = merge(
    var.extra_env,
    {
      GCP_PROJECT              = var.project
      INSTANCE_CONNECTION_NAME = var.cloud_sql_instance_connection_name
      DB_USER                  = "fsi_app"
      DB_NAME                  = "fsi_banking"
    },
  )
}

resource "google_service_account" "sink" {
  account_id   = local.sa_account
  display_name = local.service_name
  project      = var.project
}

resource "google_service_account" "pubsub_invoker" {
  account_id   = local.pubsub_sa
  display_name = "${local.service_name}-pubsub"
  project      = var.project
}

resource "google_project_iam_member" "default_roles" {
  for_each = toset(concat([
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
    "roles/cloudsql.client",
  ], var.destination_iam_roles))
  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.sink.email}"
}

resource "google_secret_manager_secret_iam_member" "db_password_accessor" {
  count     = var.db_password_secret != "" ? 1 : 0
  project   = var.project
  secret_id = var.db_password_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sink.email}"
}

resource "google_cloud_run_v2_service" "sink" {
  name     = local.service_name
  location = var.region
  project  = var.project
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.sink.email

    vpc_access {
      connector = var.vpc_connector
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.image_uri
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

      dynamic "env" {
        for_each = var.db_password_secret != "" ? [1] : []
        content {
          name = "DB_PASS"
          value_source {
            secret_key_ref {
              secret  = var.db_password_secret
              version = "latest"
            }
          }
        }
      }
    }
  }

  labels = local.labels
}

resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker_can_invoke" {
  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.sink.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_invoker.email}"
}

resource "google_pubsub_subscription" "sink_sub" {
  name    = "${var.use_case}-${var.name}-sub"
  topic   = var.source_topic
  project = var.project

  ack_deadline_seconds = var.ack_deadline_seconds

  push_config {
    push_endpoint = google_cloud_run_v2_service.sink.uri
    oidc_token {
      service_account_email = google_service_account.pubsub_invoker.email
      audience              = google_cloud_run_v2_service.sink.uri
    }
  }

  dead_letter_policy {
    dead_letter_topic     = "projects/${var.project}/topics/${var.dead_letter_topic}"
    max_delivery_attempts = var.max_delivery_attempts
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  labels = local.labels
}
