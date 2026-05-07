# dev environment — root module that composes infra/shared + per-UC infra.
# Apply order:
#   1. infra/shared/      — Cloud SQL, VPC, secrets (one-time per env)
#   2. infra/dev/         — env-level shared things (OTel, Memory Bank)
#   3. usecases/<uc>/infra/<uc>.tf — per-UC composition

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
  # backend "gcs" {
  #   bucket = "agentic-experiments-tfstate"
  #   prefix = "fsi-banking/dev"
  # }
}

provider "google" {
  project = var.project
  region  = var.region
}
