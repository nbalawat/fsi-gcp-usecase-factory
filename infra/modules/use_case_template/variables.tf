variable "use_case" {
  type        = string
  description = "Use case ID (e.g. credit-memo-commercial)."
}

variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

# Shared infra outputs (consumed via terraform_remote_state in the caller)
variable "vpc_connector_id" {
  type = string
}

variable "cloud_sql_instance_connection_name" {
  type = string
}

variable "db_password_secret" {
  type = string
}

variable "kms_key_name" {
  type    = string
  default = ""
}

# Per-UC topology
variable "source_topic" {
  type        = string
  description = "Trigger topic the handler subscribes to."
}

variable "atomic_services" {
  type = map(object({
    image_uri   = string
    description = string
  }))
  description = "Atomic services this UC needs. Key = service name; values = image + description."
  default     = {}
}

variable "handler_image_uri" {
  type    = string
  default = ""
}

variable "sinks" {
  type = map(object({
    image_uri             = string
    destination_iam_roles = list(string)
  }))
  description = "Sinks this UC needs. Key = sink name."
  default     = {}
}

variable "agent_runtime_sa" {
  type    = string
  default = ""
}

variable "credit_officer_app_sa" {
  type        = string
  description = "Console SA — only identity allowed to publish approval events."
  default     = ""
}

variable "rules_service_sa_email" {
  type    = string
  default = ""
}

variable "workflow_yaml_path" {
  type    = string
  default = ""
}

# Tagging
variable "owner" {
  type = string
}

variable "cost_center" {
  type = string
}

variable "data_classification" {
  type    = string
  default = "confidential"
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "data_classification must be one of public, internal, confidential, restricted."
  }
}
