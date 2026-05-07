variable "use_case" {
  type = string
}

variable "agent_name" {
  type        = string
  description = "Agent short name (e.g. credit_memo_supervisor)."
}

variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "manifest_path" {
  type        = string
  description = "Path to the agent manifest YAML (relative to caller)."
}

variable "memory_cluster_id" {
  type        = string
  description = "Bigtable cluster ID backing Memory Bank."
}

variable "memory_scope" {
  type        = string
  description = "Memory scope this agent uses: borrower_id | customer_id | case_id | session_id | none."
  default     = "none"
}

variable "mcp_tool_service_urls" {
  type        = list(string)
  description = "Cloud Run URLs of atomic services this agent's MCP tools point to."
  default     = []
}

variable "mcp_tool_service_account_emails" {
  type        = list(string)
  description = "SA emails of atomic services the agent must be able to invoke."
  default     = []
}

variable "enable_model_armor" {
  type        = bool
  default     = true
  description = "Vertex AI prompt-injection guardrail."
}

variable "owner" {
  type = string
}

variable "cost_center" {
  type = string
}

variable "data_classification" {
  type    = string
  default = "confidential"
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "data_classification must be one of public, internal, confidential, restricted."
  }
}
