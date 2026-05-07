variable "name" {
  type        = string
  description = "Cloud SQL instance short name (e.g. fsi-banking-dev)."
}

variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "tier" {
  type        = string
  default     = "db-g1-small"
  description = "Machine tier. db-g1-small for dev; bump for staging/prod."
}

variable "disk_size_gb" {
  type    = number
  default = 20
}

variable "vpc_id" {
  type        = string
  description = "VPC self-link the instance attaches to (private IP only)."
}

variable "kms_key_name" {
  type        = string
  default     = ""
  description = "CMEK key. Required for prod; recommended elsewhere."
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "owner" {
  type = string
}

variable "cost_center" {
  type = string
}
