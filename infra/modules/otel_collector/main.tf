# otel_collector — single Cloud Run service running the OpenTelemetry
# Collector. Every atomic service / handler / sink in the platform exports
# spans + metrics here via OTEL_EXPORTER_OTLP_ENDPOINT.
#
# Conventions:
#   - Internal-only ingress; only same-project Cloud Run services can reach it.
#   - Min instances = 1 so traces don't drop during burst-after-idle.
#   - Writes to Cloud Trace + Cloud Monitoring + Cloud Logging via the
#     Google-managed exporter image.

locals {
  service_name = "fsi-otel-collector-${var.environment}"
  sa_account   = substr("fsi-otel-${var.environment}", 0, 30)
  labels = {
    use_case            = "platform-shared"
    component           = "otel_collector"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = "internal"
    environment         = var.environment
  }
}

resource "google_service_account" "otel" {
  account_id   = local.sa_account
  display_name = local.service_name
  project      = var.project
}

resource "google_project_iam_member" "otel_default_roles" {
  for_each = toset([
    "roles/cloudtrace.agent",
    "roles/monitoring.metricWriter",
    "roles/logging.logWriter",
  ])
  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.otel.email}"
}

resource "google_cloud_run_v2_service" "collector" {
  name     = local.service_name
  location = var.region
  project  = var.project
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.otel.email

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

      ports {
        name           = "h2c" # OTLP/gRPC uses HTTP/2 cleartext
        container_port = 4317
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project
      }
      env {
        name  = "OTEL_TRACE_SAMPLING_RATIO"
        value = tostring(var.trace_sampling_ratio)
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }
    }
  }

  labels     = local.labels
  depends_on = [google_project_iam_member.otel_default_roles]
}

# Allow authenticated callers (combined with INGRESS_TRAFFIC_INTERNAL_ONLY this
# means same-project Google services only). Production: scope per-service-account.
resource "google_cloud_run_v2_service_iam_member" "internal_callers" {
  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.collector.name
  role     = "roles/run.invoker"
  member   = "allAuthenticatedUsers"
}
