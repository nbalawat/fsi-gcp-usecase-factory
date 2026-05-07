# providers.tf — terraform + google provider configuration for the shared
# framework infrastructure (Cloud SQL, KMS keyring, networking).
# Apply with: cd infra/shared && terraform init && terraform apply

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Remote state recommended in production. For dev we use local state.
  # backend "gcs" {
  #   bucket = "agentic-experiments-tfstate"
  #   prefix = "fsi-banking/shared"
  # }
}

provider "google" {
  project = var.project
  region  = var.region
}
