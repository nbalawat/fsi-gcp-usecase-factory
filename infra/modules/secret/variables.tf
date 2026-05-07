variable "secret_id" {
  type        = string
  description = "Secret short ID (e.g. fsi-banking-db-pass-dev)."
}

variable "project" {
  type = string
}

variable "secret_data" {
  type        = string
  description = "Secret value to store. Sensitive — Terraform marks it accordingly."
  sensitive   = true
}

variable "accessor_sa_emails" {
  type        = list(string)
  description = "SA emails granted secretmanager.secretAccessor on this secret."
  default     = []
}

variable "use_case" {
  type    = string
  default = "shared"
}

variable "owner" {
  type = string
}

variable "cost_center" {
  type = string
}

variable "data_classification" {
  type    = string
  default = "restricted"
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "data_classification must be one of public, internal, confidential, restricted."
  }
}
