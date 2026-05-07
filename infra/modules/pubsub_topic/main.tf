# pubsub_topic — topic + optional schema + CMEK + bank-policy labels.
#
# Conventions enforced:
#   - confidential / restricted topics MUST carry a kms_key_name (CMEK).
#     Validated by policies/encryption.rego at apply time.
#   - retention defaults to 7 days (regulatory replay window).
#   - all five required labels.

locals {
  labels = {
    use_case            = var.use_case
    component           = "pubsub_topic"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }

  needs_cmek = contains(["confidential", "restricted"], var.data_classification)
}

# Refuse confidential topics without CMEK.
resource "null_resource" "cmek_required_check" {
  count = local.needs_cmek && var.kms_key_name == "" ? 1 : 0
  triggers = {
    error = "Topic ${var.name} has data_classification=${var.data_classification} but no kms_key_name. CMEK is required for confidential/restricted topics."
  }
  provisioner "local-exec" {
    command = "echo '${self.triggers.error}' >&2 && exit 1"
  }
}

resource "google_pubsub_schema" "schema" {
  count      = var.schema_id != "" && var.schema_definition != "" ? 1 : 0
  name       = var.schema_id
  type       = var.schema_type
  definition = var.schema_definition
  project    = var.project
}

resource "google_pubsub_topic" "topic" {
  name    = var.name
  project = var.project
  labels  = local.labels

  message_retention_duration = var.message_retention_duration

  dynamic "schema_settings" {
    for_each = var.schema_id != "" ? [1] : []
    content {
      schema   = "projects/${var.project}/schemas/${var.schema_id}"
      encoding = "JSON"
    }
  }

  # CMEK is set via the top-level kms_key_name attribute (not a block).
  kms_key_name = var.kms_key_name != "" ? var.kms_key_name : null

  depends_on = [google_pubsub_schema.schema]
}
