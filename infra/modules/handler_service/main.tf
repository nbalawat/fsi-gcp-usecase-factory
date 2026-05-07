# handler_service — Cloud Run + Pub/Sub push subscription with DLQ.
#
# The handler is the use-case entry point: receives the trigger event from
# the source topic via Pub/Sub push, enriches it, and publishes to next_topic
# for the workflow to pick up. Step 1 of the 5-step paradigm.
#
# Conventions:
#   - Ingress is `internal-and-cloud-load-balancing` so Pub/Sub push (which
#     comes from a Google service) can reach it, but external internet cannot.
#   - The push subscription uses OIDC auth — Pub/Sub presents a Google-signed
#     ID token, the handler validates audience.
#   - DLQ is mandatory; no max-retry-loop without one.

locals {
  service_name       = "fsi-handler-${var.use_case}"
  pubsub_sa_account  = "fsi-handler-${var.use_case}-pubsub"
  service_sa_account = substr("fsi-handler-${var.use_case}", 0, 30)
  labels = {
    use_case            = var.use_case
    component           = "handler"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
  base_env = merge(
    var.extra_env,
    {
      GCP_PROJECT                 = var.project
      ENRICHED_TOPIC              = var.next_topic
      INSTANCE_CONNECTION_NAME    = var.cloud_sql_instance_connection_name
      OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_collector_endpoint
    },
  )
}

# Service account that runs the handler (its identity).
resource "google_service_account" "handler" {
  account_id   = local.service_sa_account
  display_name = local.service_name
  project      = var.project
}

# Service account Pub/Sub uses to invoke the handler with OIDC.
resource "google_service_account" "pubsub_invoker" {
  account_id   = local.pubsub_sa_account
  display_name = "${local.service_name}-pubsub"
  project      = var.project
}

resource "google_project_iam_member" "handler_default_roles" {
  for_each = toset([
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
    "roles/pubsub.publisher", # to publish to next_topic
  ])
  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.handler.email}"
}

# Cloud SQL access if a connection name is supplied.
resource "google_project_iam_member" "handler_cloudsql" {
  count   = var.cloud_sql_instance_connection_name != "" ? 1 : 0
  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.handler.email}"
}

resource "google_cloud_run_v2_service" "handler" {
  name     = local.service_name
  location = var.region
  project  = var.project
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" # Pub/Sub-compatible

  template {
    service_account = google_service_account.handler.email

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

  labels     = local.labels
  depends_on = [google_project_iam_member.handler_default_roles]
}

# Allow the Pub/Sub-invoker SA to call the handler.
resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker_can_invoke" {
  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.handler.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_invoker.email}"
}

resource "google_pubsub_subscription" "push" {
  name    = "${var.use_case}-handler-sub"
  topic   = var.source_topic
  project = var.project

  ack_deadline_seconds = var.ack_deadline_seconds

  push_config {
    push_endpoint = google_cloud_run_v2_service.handler.uri
    oidc_token {
      service_account_email = google_service_account.pubsub_invoker.email
      audience              = google_cloud_run_v2_service.handler.uri
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
