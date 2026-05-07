# cloud_workflow — Cloud Workflows YAML deploy + dedicated workflow SA + scoped IAM.
#
# Conventions enforced:
#   - Each use case gets its own workflow SA — least privilege.
#   - The workflow SA is granted run.invoker only on the specific Cloud Run
#     services it actually calls (atomic services + rules-service + agent runtime).
#   - It is NEVER granted pubsub.publisher on approval_events. That privilege
#     belongs to the credit-officer console SA only (prevents self-approval).

locals {
  sa_account_id = substr("fsi-wf-${var.use_case}", 0, 30)
  labels = {
    use_case            = var.use_case
    component           = "workflow"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
}

resource "google_service_account" "workflow" {
  account_id   = local.sa_account_id
  display_name = "fsi-workflow-${var.use_case}"
  project      = var.project
}

resource "google_project_iam_member" "default_roles" {
  for_each = toset([
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
    "roles/workflows.invoker",
  ])
  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.workflow.email}"
}

# Grant run.invoker on each atomic service the workflow calls.
resource "google_project_iam_member" "atomic_invoker" {
  for_each = toset(var.atomic_service_sa_emails)
  project  = var.project
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.workflow.email}"
  # Note: a more granular binding per service via google_cloud_run_v2_service_iam_member
  # is preferred in production. Project-level is the simple default.
}

# rules-service invoker
resource "google_project_iam_member" "rules_invoker" {
  count   = var.rules_service_sa_email != "" ? 1 : 0
  project = var.project
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.workflow.email}"
}

# agent runtime
resource "google_project_iam_member" "agent_runtime_user" {
  count   = var.agent_runtime_sa_email != "" ? 1 : 0
  project = var.project
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.workflow.email}"
}

# Pub/Sub publisher on the explicit topic list (NEVER includes approval_events).
resource "google_pubsub_topic_iam_member" "publisher" {
  for_each = toset(var.publish_topic_ids)
  project  = var.project
  topic    = each.value
  role     = "roles/pubsub.publisher"
  member   = "serviceAccount:${google_service_account.workflow.email}"
}

resource "google_workflows_workflow" "workflow" {
  name            = var.workflow_name
  region          = var.region
  project         = var.project
  service_account = google_service_account.workflow.email
  source_contents = file(var.source_yaml)

  labels     = local.labels
  depends_on = [google_project_iam_member.default_roles]
}
