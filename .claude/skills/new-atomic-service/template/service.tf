module "{{SERVICE_NAME}}" {
  source = "../modules/atomic_service"

  name        = "{{SERVICE_NAME}}"
  description = "{{DESCRIPTION}}"
  region      = var.region
  project     = var.project
  image_tag   = var.image_tag

  # Resource sizing
  cpu             = "1"
  memory          = "512Mi"
  min_instances   = 0
  max_instances   = 100
  concurrency     = 80
  timeout_seconds = 30

  # Networking — internal only (only workflows and agent runtime call atomic services)
  ingress       = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  vpc_connector = var.vpc_connector

  # IAM — least privilege
  service_account_roles = [
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
  ]

  # Observability
  enable_otel             = true
  otel_collector_endpoint = var.otel_collector_endpoint

  labels = {
    use_case            = "{{USE_CASE_ID}}"
    component           = "atomic_service"
    owner               = "platform-team"
    cost_center         = var.cost_center
    data_classification = "internal"
  }
}

# Allow agent runtime and workflows to invoke this service
resource "google_cloud_run_v2_service_iam_member" "agent_runtime_invoker" {
  project  = module.{{SERVICE_NAME}}.project
  location = module.{{SERVICE_NAME}}.location
  name     = module.{{SERVICE_NAME}}.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoker" {
  project  = module.{{SERVICE_NAME}}.project
  location = module.{{SERVICE_NAME}}.location
  name     = module.{{SERVICE_NAME}}.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.workflow_sa}"
}
