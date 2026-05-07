variable "use_case" {
  type        = string
  description = "Use case ID this handler serves."
}

variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "image_uri" {
  type        = string
  description = "Container image URI for the handler."
}

variable "source_topic" {
  type        = string
  description = "Pub/Sub topic ID the handler subscribes to (e.g. loans.application.submitted)."
}

variable "next_topic" {
  type        = string
  description = "Pub/Sub topic ID the handler publishes to after enrichment (e.g. credit-memo-commercial.enriched)."
}

variable "dead_letter_topic" {
  type        = string
  description = "DLQ topic ID for terminally failing messages."
}

variable "max_delivery_attempts" {
  type    = number
  default = 5
}

variable "ack_deadline_seconds" {
  type    = number
  default = 60
}

variable "vpc_connector" {
  type = string
}

variable "cloud_sql_instance_connection_name" {
  type = string
}

variable "db_password_secret" {
  type    = string
  default = ""
}

variable "otel_collector_endpoint" {
  type    = string
  default = ""
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

variable "extra_env" {
  type    = map(string)
  default = {}
}
