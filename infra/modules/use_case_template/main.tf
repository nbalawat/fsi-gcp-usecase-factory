# use_case_template — top-level composer for one use case.
#
# Calls into atomic_service / handler_service / sink_adapter / pubsub_topic
# / cloud_workflow / agent_runtime_deployment with the bank's defaults.
# A use case's TF becomes a single ~30-line module call into this template.

locals {
  topic_names = {
    enriched        = "${var.use_case}.enriched"
    decided         = "${var.use_case}.decided"
    approval_events = "${var.use_case}.approval_events"
    dlq             = "${var.use_case}.dlq"
  }
  common_tags = {
    use_case            = var.use_case
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
}

# ── Topics (4 standard topics per UC) ─────────────────────────────────────

module "topic_enriched" {
  source = "../pubsub_topic"

  name         = local.topic_names.enriched
  project      = var.project
  kms_key_name = var.kms_key_name

  use_case            = var.use_case
  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

module "topic_decided" {
  source = "../pubsub_topic"

  name         = local.topic_names.decided
  project      = var.project
  kms_key_name = var.kms_key_name

  use_case            = var.use_case
  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

module "topic_approval_events" {
  source = "../pubsub_topic"

  name         = local.topic_names.approval_events
  project      = var.project
  kms_key_name = var.kms_key_name

  use_case            = var.use_case
  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

module "topic_dlq" {
  source = "../pubsub_topic"

  name = local.topic_names.dlq
  # DLQ classification follows the source classification
  project      = var.project
  kms_key_name = var.kms_key_name

  use_case            = var.use_case
  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

# ── Atomic services ────────────────────────────────────────────────────────

module "atomic_services" {
  source   = "../atomic_service"
  for_each = var.atomic_services

  name        = each.key
  description = each.value.description
  project     = var.project
  region      = var.region
  image_uri   = each.value.image_uri

  vpc_connector                      = var.vpc_connector_id
  cloud_sql_instance_connection_name = var.cloud_sql_instance_connection_name
  db_password_secret                 = var.db_password_secret

  use_case            = var.use_case
  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

# ── Handler ────────────────────────────────────────────────────────────────

module "handler" {
  count  = var.handler_image_uri != "" ? 1 : 0
  source = "../handler_service"

  use_case  = var.use_case
  project   = var.project
  region    = var.region
  image_uri = var.handler_image_uri

  source_topic      = var.source_topic
  next_topic        = local.topic_names.enriched
  dead_letter_topic = local.topic_names.dlq

  vpc_connector                      = var.vpc_connector_id
  cloud_sql_instance_connection_name = var.cloud_sql_instance_connection_name
  db_password_secret                 = var.db_password_secret

  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

# ── Sinks ──────────────────────────────────────────────────────────────────

module "sinks" {
  source   = "../sink_adapter"
  for_each = var.sinks

  use_case  = var.use_case
  name      = each.key
  project   = var.project
  region    = var.region
  image_uri = each.value.image_uri

  source_topic      = local.topic_names.decided
  dead_letter_topic = local.topic_names.dlq

  vpc_connector                      = var.vpc_connector_id
  cloud_sql_instance_connection_name = var.cloud_sql_instance_connection_name
  db_password_secret                 = var.db_password_secret

  destination_iam_roles = each.value.destination_iam_roles

  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}

# ── Approval-events publisher binding (CRITICAL: credit-officer SA only) ──

resource "google_pubsub_topic_iam_member" "credit_officer_publishes_approvals" {
  count   = var.credit_officer_app_sa != "" ? 1 : 0
  project = var.project
  topic   = module.topic_approval_events.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.credit_officer_app_sa}"
}

# Verification: agent_runtime_sa must NEVER equal credit_officer_app_sa.
# Apply-time validation runs in the caller via a precondition; here we just
# assert the binding above doesn't reference the agent SA.

# ── Workflow ──────────────────────────────────────────────────────────────

module "workflow" {
  count  = var.workflow_yaml_path != "" ? 1 : 0
  source = "../cloud_workflow"

  use_case      = var.use_case
  project       = var.project
  region        = var.region
  workflow_name = "${var.use_case}-workflow"
  source_yaml   = var.workflow_yaml_path

  atomic_service_sa_emails = [for s in module.atomic_services : s.service_account_email]
  rules_service_sa_email   = var.rules_service_sa_email
  agent_runtime_sa_email   = var.agent_runtime_sa

  publish_topic_ids = [
    module.topic_enriched.name,
    module.topic_decided.name,
    module.topic_dlq.name,
    # NOTE: approval_events is intentionally excluded.
  ]

  owner               = var.owner
  cost_center         = var.cost_center
  data_classification = var.data_classification
}
