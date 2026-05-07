# Inputs for the atomic_service module.

variable "name" {
  type        = string
  description = "Service name (kebab-case). Used for the Cloud Run service name and SA name."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,49}$", var.name))
    error_message = "name must be lowercase kebab-case, 3-50 chars."
  }
}

variable "description" {
  type        = string
  description = "One-sentence description of what the service computes."
}

variable "project" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GCP region for Cloud Run + service account."
  default     = "us-central1"
}

variable "image_uri" {
  type        = string
  description = "Container image URI (e.g. us-central1-docker.pkg.dev/<project>/cloud-run-source-deploy/<name>:latest)."
}

# Resource sizing
variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "concurrency" {
  type    = number
  default = 80
}

variable "timeout_seconds" {
  type    = number
  default = 60
}

# Networking
variable "ingress" {
  type        = string
  description = "Cloud Run ingress: INGRESS_TRAFFIC_INTERNAL_ONLY (default) or INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER or INGRESS_TRAFFIC_ALL."
  default     = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  validation {
    condition = contains([
      "INGRESS_TRAFFIC_INTERNAL_ONLY",
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
      "INGRESS_TRAFFIC_ALL",
    ], var.ingress)
    error_message = "ingress must be a valid Cloud Run ingress value."
  }
}

variable "vpc_connector" {
  type        = string
  description = "Serverless VPC Access connector resource ID (for reaching Cloud SQL on private IP)."
}

# Cloud SQL connection
variable "cloud_sql_instance_connection_name" {
  type        = string
  description = "Cloud SQL instance connection name (project:region:instance) for the connector to attach."
}

variable "db_password_secret" {
  type        = string
  description = "Secret Manager secret short ID containing DB_PASS (e.g. fsi-banking-db-pass-dev)."
}

# Observability
variable "otel_collector_endpoint" {
  type        = string
  description = "Endpoint for the OpenTelemetry collector."
  default     = ""
}

# Tagging — bank policy enforces these labels (see policies/tagging.rego).
variable "use_case" {
  type        = string
  description = "use_case label."
}

variable "owner" {
  type        = string
  description = "owner label (team name)."
}

variable "cost_center" {
  type        = string
  description = "cost_center label."
}

variable "data_classification" {
  type        = string
  description = "data_classification label: public | internal | confidential | restricted."
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "data_classification must be one of public, internal, confidential, restricted."
  }
}

# Optional environment variables (non-secret)
variable "extra_env" {
  type        = map(string)
  description = "Additional non-secret environment variables to set on the service."
  default     = {}
}

# Service account roles to grant (additive). Always grants run.invoker to
# itself and cloudsql.client + secretAccessor for the DB password.
variable "additional_sa_roles" {
  type        = list(string)
  description = "Project-level roles to grant the service's SA, in addition to the defaults."
  default     = []
}
