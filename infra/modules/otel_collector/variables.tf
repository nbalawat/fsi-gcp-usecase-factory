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

variable "image_uri" {
  type        = string
  description = "OTel collector container image. Default = upstream contrib; bank prod should mirror to Artifact Registry."
  default     = "otel/opentelemetry-collector-contrib:0.108.0"
}

variable "vpc_connector" {
  type        = string
  description = "Serverless VPC Access connector — collector receives traces from internal-only Cloud Run services."
}

variable "min_instances" {
  type        = number
  default     = 1
  description = "Keep ≥1 warm so traces don't drop on cold start."
}

variable "max_instances" {
  type    = number
  default = 5
}

variable "trace_sampling_ratio" {
  type        = number
  default     = 1.0
  description = "1.0 = 100% sampling. Bank policy: 100% sampling for audit-bearing flows; lower only for high-volume realtime use cases."
}

variable "owner" {
  type    = string
  default = "platform"
}

variable "cost_center" {
  type    = string
  default = "cc-platform-001"
}
