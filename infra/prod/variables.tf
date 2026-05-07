variable "project" {
  type    = string
  default = "agentic-experiments"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "kms_key_name" {
  type        = string
  description = "CMEK key. REQUIRED in prod — bank policy."
  validation {
    condition     = length(var.kms_key_name) > 0
    error_message = "kms_key_name is mandatory in prod (regulatory requirement)."
  }
}
