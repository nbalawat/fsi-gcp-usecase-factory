variable "use_case" {
  type = string
}

variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "workflow_name" {
  type        = string
  description = "Cloud Workflows resource name (e.g. credit-memo-commercial-workflow)."
}

variable "source_yaml" {
  type        = string
  description = "Path to the workflow YAML file (relative to the calling module)."
}

# Service accounts the workflow can invoke.
variable "atomic_service_sa_emails" {
  type        = list(string)
  description = "Atomic-service SA emails the workflow should be granted run.invoker on."
  default     = []
}

variable "rules_service_sa_email" {
  type        = string
  description = "rules-service SA email the workflow should be granted run.invoker on."
}

variable "agent_runtime_sa_email" {
  type        = string
  description = "Agent runtime SA the workflow should be granted run.invoker on (Vertex AI)."
}

variable "publish_topic_ids" {
  type        = list(string)
  description = "Pub/Sub topic IDs the workflow needs publisher rights on (e.g. enriched, decided, dlq). Approval-events topic is intentionally excluded — see policies/iam.rego."
  default     = []
}

variable "owner" {
  type = string
}

variable "cost_center" {
  type = string
}

variable "data_classification" {
  type = string
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "data_classification must be one of public, internal, confidential, restricted."
  }
}
