# Input variables for the shared framework infrastructure.

variable "project" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GCP region."
  default     = "us-central1"
}

variable "environment" {
  type        = string
  description = "Environment name (dev | staging | prod)."
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of dev, staging, prod"
  }
}
