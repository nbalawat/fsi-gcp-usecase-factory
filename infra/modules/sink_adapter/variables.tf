variable "use_case" {
  type = string
}

variable "name" {
  type        = string
  description = "Sink short name (e.g. gl-posting, document-store-gcs)."
}

variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "image_uri" {
  type = string
}

variable "source_topic" {
  type        = string
  description = "Pub/Sub topic the sink consumes (typically the use case's decided topic)."
}

variable "ack_deadline_seconds" {
  type    = number
  default = 60
}

variable "max_delivery_attempts" {
  type    = number
  default = 5
}

variable "dead_letter_topic" {
  type = string
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

variable "destination_iam_roles" {
  type        = list(string)
  description = "Project-level roles the sink SA needs on its destination (e.g. roles/storage.objectCreator for GCS sinks)."
  default     = []
}

variable "extra_env" {
  type    = map(string)
  default = {}
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
