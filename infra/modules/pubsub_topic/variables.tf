variable "name" {
  type        = string
  description = "Topic short name (e.g. credit-memo-commercial.enriched)."
}

variable "project" {
  type = string
}

variable "schema_id" {
  type        = string
  description = "Optional Pub/Sub schema ID; if non-empty the topic enforces this schema."
  default     = ""
}

variable "schema_definition" {
  type        = string
  description = "Schema definition (Avro / Proto). Required if schema_id is set and the schema doesn't already exist."
  default     = ""
}

variable "schema_type" {
  type    = string
  default = "AVRO"
  validation {
    condition     = contains(["AVRO", "PROTOCOL_BUFFER"], var.schema_type)
    error_message = "schema_type must be AVRO or PROTOCOL_BUFFER."
  }
}

variable "message_retention_duration" {
  type        = string
  default     = "604800s" # 7 days; banks need replay window
  description = "How long Pub/Sub retains unacked messages."
}

variable "kms_key_name" {
  type        = string
  default     = ""
  description = "CMEK key name. Required for confidential / restricted classification."
}

# Tagging
variable "use_case" {
  type = string
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
