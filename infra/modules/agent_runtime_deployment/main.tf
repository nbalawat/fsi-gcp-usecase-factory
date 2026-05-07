# agent_runtime_deployment — provisions an agent's runtime identity + IAM
# bindings to atomic services + Memory Bank access.
#
# NOTE: The actual Vertex AI Agent Builder deployment is performed by the
# `fsi-deploy` skill (or scripts/deploy_use_case.sh) using the manifest YAML.
# Terraform here only owns the IAM + identity surface; the agent ENGINE's
# binary deployment is via a separate path (Vertex AI Agent Builder API).

locals {
  sa_account = substr("fsi-agent-${var.use_case}-${var.agent_name}", 0, 30)
  labels = {
    use_case            = var.use_case
    component           = "agent_runtime"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
}

resource "google_service_account" "agent" {
  account_id   = local.sa_account
  display_name = "fsi-agent-${var.use_case}-${var.agent_name}"
  project      = var.project
}

resource "google_project_iam_member" "default_roles" {
  for_each = toset([
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
    "roles/aiplatform.user", # to invoke Vertex models
    "roles/bigtable.user",   # to read/write Memory Bank
  ])
  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.agent.email}"
}

# Allow this agent runtime to invoke each atomic service it has an MCP tool for.
resource "google_project_iam_member" "atomic_invoker" {
  for_each = toset(var.mcp_tool_service_account_emails)
  project  = var.project
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.agent.email}"
  # Per-service granularity preferred; project-level is the simple default.
}

# CRITICAL: this module does NOT grant pubsub.publisher on approval_events.
# That permission belongs to credit_officer_app_sa only — see policies/iam.rego
# and tests/framework/gatekeepers/fixtures/security_reviewer/violation_self_approval/.
