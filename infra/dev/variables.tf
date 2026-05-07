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
  default     = ""
  description = "CMEK key for env-level resources. Optional in dev."
}
