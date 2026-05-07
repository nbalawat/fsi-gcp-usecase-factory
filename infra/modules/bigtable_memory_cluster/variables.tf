variable "instance_id" {
  type    = string
  default = "fsi-memory"
}

variable "cluster_id" {
  type    = string
  default = "fsi-memory-c1"
}

variable "project" {
  type = string
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "num_nodes" {
  type        = number
  default     = 1
  description = "Min 1 for dev. Production should be ≥ 3 with regional replication."
}

variable "kms_key_name" {
  type    = string
  default = ""
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
