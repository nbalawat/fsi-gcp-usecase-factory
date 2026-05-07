# ─────────────────────────────────────────────────────────────────────────────
# use case: credit-memo-commercial
# archetype: pipeline-originator@1.0
# pattern:   extractor-spreader-rater-drafter@1.0
# console:   pipeline-console
# regimes:   OCC, Reg O, CECL
#
# Composes the bank's reusable modules (infra/modules/*) into a complete UC.
# This file is what every use case looks like at scale: ~80 lines of module
# calls with the use-case-specific topology (services + sinks + image URIs).
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

# ── Variables ──────────────────────────────────────────────────────────────

variable "project" {
  type    = string
  default = "agentic-experiments"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "kms_key_name" {
  type        = string
  description = "CMEK key resource name. Required for Pub/Sub topics + Cloud SQL."
  default     = ""
}

variable "agent_runtime_sa" {
  type        = string
  description = "Vertex AI Agent runtime SA email. Used by the workflow as a Vertex caller. NEVER bound to approval_events publisher."
}

variable "credit_officer_app_sa" {
  type        = string
  description = "Credit-officer console SA. The ONLY identity allowed to publish approval_events."
}

# Cross-variable invariant: the credit-officer SA must NEVER equal the agent
# runtime SA — that would let the agent fabricate its own approvals.
check "credit_officer_distinct_from_agent" {
  assert {
    condition     = var.credit_officer_app_sa != var.agent_runtime_sa
    error_message = "credit_officer_app_sa must differ from agent_runtime_sa to prevent self-approval."
  }
}

variable "rules_service_sa_email" {
  type    = string
  default = ""
}

variable "images" {
  type = object({
    handler              = string
    financial_spreader   = string
    dscr_calculator      = string
    covenant_analyzer    = string
    peer_benchmarker     = string
    industry_risk_scorer = string
    collateral_valuator  = string
    exposure_aggregator  = string
    gl_posting           = string
    document_store_gcs   = string
  })
  description = "Container image URIs for every service this UC owns."
}

# ── Shared infra (consumed via remote state) ──────────────────────────────

data "terraform_remote_state" "shared" {
  backend = "local"
  config = {
    path = "../../../infra/shared/terraform.tfstate"
  }
}

# ── Use case composition ──────────────────────────────────────────────────

module "credit_memo_commercial" {
  source = "../../../infra/modules/use_case_template"

  use_case    = "credit-memo-commercial"
  project     = var.project
  region      = var.region
  environment = var.environment

  vpc_connector_id                   = data.terraform_remote_state.shared.outputs.vpc_connector_id
  cloud_sql_instance_connection_name = data.terraform_remote_state.shared.outputs.cloud_sql_instance_connection_name
  db_password_secret                 = data.terraform_remote_state.shared.outputs.db_password_secret_id
  kms_key_name                       = var.kms_key_name

  source_topic = "loans.application.submitted"

  atomic_services = {
    "financial-spreader"   = { image_uri = var.images.financial_spreader,   description = "Spread income statement, balance sheet, cash flow → ratios." }
    "dscr-calculator"      = { image_uri = var.images.dscr_calculator,      description = "Compute DSCR base + stressed under loan terms." }
    "covenant-analyzer"    = { image_uri = var.images.covenant_analyzer,    description = "Test proposed covenants + project 4-quarter breaches." }
    "peer-benchmarker"     = { image_uri = var.images.peer_benchmarker,     description = "NAICS-3 peer set + percentile ranks." }
    "industry-risk-scorer" = { image_uri = var.images.industry_risk_scorer, description = "Industry risk band A-E from sector + macro signals." }
    "collateral-valuator"  = { image_uri = var.images.collateral_valuator,  description = "Lendable value after appraisal + condition haircuts." }
    "exposure-aggregator"  = { image_uri = var.images.exposure_aggregator,  description = "Single-borrower exposure vs Tier-1 capital." }
  }

  handler_image_uri = var.images.handler

  sinks = {
    "gl-posting"         = { image_uri = var.images.gl_posting,         destination_iam_roles = [] }
    "document-store-gcs" = { image_uri = var.images.document_store_gcs, destination_iam_roles = ["roles/storage.objectCreator"] }
  }

  workflow_yaml_path     = "${path.module}/../workflow.yaml"
  rules_service_sa_email = var.rules_service_sa_email
  agent_runtime_sa       = var.agent_runtime_sa
  credit_officer_app_sa  = var.credit_officer_app_sa

  owner               = "credit-platform"
  cost_center         = "cc-credit-001"
  data_classification = "confidential"
}

# ── Outputs ────────────────────────────────────────────────────────────────

output "topics" {
  value = module.credit_memo_commercial.topics
}

output "atomic_services" {
  value = module.credit_memo_commercial.atomic_services
}

output "handler_url" {
  value = module.credit_memo_commercial.handler_url
}

output "workflow_id" {
  value = module.credit_memo_commercial.workflow_id
}
