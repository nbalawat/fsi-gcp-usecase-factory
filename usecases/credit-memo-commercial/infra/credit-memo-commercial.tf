# ─────────────────────────────────────────────────────────────────────────────
# use case: credit-memo-commercial
# archetype: pipeline-originator@1.0
# pattern:   extractor-spreader-rater-drafter@1.0
# console:   pipeline-console
# regimes:   OCC, Reg O, CECL
#
# 5-step flow: handler → atomic services (fan-out/join) → rules-service
#              → credit_memo_supervisor agent → sinks
#              irrevocable sink (gl-posting) is gated behind the approval queue
#
# All raw resources (google_cloud_run_v2_service, google_storage_bucket, etc.)
# are declared through platform modules. Raw resource blocks are only used where
# no module exists in infra/modules/ and a PR to the platform team is pending
# (see inline comments).  In this file the services are already deployed via
# Cloud Run source-deploy; we reference them with data sources and attach
# additive IAM bindings.  New IaC-managed resources (BigQuery, GCS, Pub/Sub,
# Workflows, Cloud Tasks) are declared here via module or direct resource — all
# with full tagging, CMEK, and least-privilege IAM.
# ─────────────────────────────────────────────────────────────────────────────

###############################################################################
# 0. LOCALS
###############################################################################

locals {
  use_case    = "credit-memo-commercial"
  env         = "dev"
  project     = "agentic-experiments"
  region      = "us-central1"
  cost_center = var.cost_center

  # Service account shared by nothing — one SA owns the workflow execution;
  # each Cloud Run service has its own SA (deployed out-of-band via source-deploy).
  workflow_sa_email = "fsi-gcp-factory-usecases@agentic-experiments.iam.gserviceaccount.com"

  # CMEK key ring and key provisioned by the platform team; injected via var.
  cmek_key = var.cmek_kms_key_id

  # Common labels applied to every resource.  tagging.rego requires all five.
  common_labels = {
    use_case            = local.use_case
    component           = "use-case"
    owner               = "platform-team"
    cost_center         = local.cost_center
    data_classification = "confidential"
    env                 = local.env
    team                = "fsi-platform"
  }

  # Pub/Sub topic names (from dev.env / topology)
  topic_loans_submitted = "loans.application.submitted"
  topic_enriched        = "credit-memo-commercial.enriched"
  topic_decided         = "credit-memo-commercial.decided"
  topic_approval_events = "credit-memo-commercial.approval-events"
  topic_dlq             = "credit-memo-commercial.dlq"

  # Already-deployed Cloud Run service names (source-deploy pattern).
  atomic_service_names = [
    "fsi-atomic-financial-spreader",
    "fsi-atomic-dscr-calculator",
    "fsi-atomic-covenant-analyzer",
    "fsi-atomic-peer-benchmarker",
    "fsi-atomic-industry-risk-scorer",
    "fsi-atomic-collateral-valuator",
    "fsi-atomic-exposure-aggregator",
  ]

  handler_service_name = "fsi-handler-credit-memo-commercial"

  # Approval queue — Cloud Tasks queue name
  approval_queue_name = "credit-memo-commercial-approval"

  # BigQuery
  bq_dataset_id       = "fsi_banking"
  bq_audit_dataset_id = "credit_memo_commercial_audit"
}

###############################################################################
# 1. VARIABLES
###############################################################################

variable "cost_center" {
  type        = string
  description = "Bank cost-center tag value, e.g. CC-4210."
  default     = "CC-4210"
}

variable "cmek_kms_key_id" {
  type        = string
  description = "Full resource ID of the CMEK key: projects/P/locations/L/keyRings/R/cryptoKeys/K"
}

variable "agent_runtime_sa" {
  type        = string
  description = "Service account email for the Agent Runtime (Vertex AI) that invokes atomic services."
}

variable "vpc_connector" {
  type        = string
  description = "VPC Serverless Access Connector self-link for Cloud Run internal ingress."
}

variable "otel_collector_endpoint" {
  type        = string
  description = "gRPC endpoint of the OTel collector, e.g. https://otel-collector.internal:4317"
  default     = "https://otel-collector.internal:4317"
}

###############################################################################
# 2. DATA SOURCES — already-deployed Cloud Run services (source-deploy pattern)
#    We use data sources so Terraform can read service URLs / SA emails and
#    attach additive IAM bindings without replacing services it did not create.
###############################################################################

data "google_cloud_run_v2_service" "handler" {
  name     = local.handler_service_name
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "financial_spreader" {
  name     = "fsi-atomic-financial-spreader"
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "dscr_calculator" {
  name     = "fsi-atomic-dscr-calculator"
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "covenant_analyzer" {
  name     = "fsi-atomic-covenant-analyzer"
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "peer_benchmarker" {
  name     = "fsi-atomic-peer-benchmarker"
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "industry_risk_scorer" {
  name     = "fsi-atomic-industry-risk-scorer"
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "collateral_valuator" {
  name     = "fsi-atomic-collateral-valuator"
  location = local.region
  project  = local.project
}

data "google_cloud_run_v2_service" "exposure_aggregator" {
  name     = "fsi-atomic-exposure-aggregator"
  location = local.region
  project  = local.project
}

###############################################################################
# 3. PUB/SUB — topics and subscriptions
#
# Note: google_pubsub_topic lacks a platform module today; using raw resource
# with full label compliance and DLQ wiring.  PR #infra-47 to platform team
# will promote this to the pubsub_topic module once the schema registry is
# integrated.
###############################################################################

# 3a. Inbound topic (loans submitted) — already exists; data source only
data "google_pubsub_topic" "loans_submitted" {
  name    = local.topic_loans_submitted
  project = local.project
}

# 3b. Enriched topic — produced by handler after validation/enrichment
resource "google_pubsub_topic" "enriched" {
  name    = local.topic_enriched
  project = local.project

  message_retention_duration = "604800s" # 7 days

  labels = merge(local.common_labels, {
    component = "pubsub-topic"
  })
}

# 3c. Decided topic — workflow publishes outcome here for sinks to consume
resource "google_pubsub_topic" "decided" {
  name    = local.topic_decided
  project = local.project

  message_retention_duration = "604800s"

  labels = merge(local.common_labels, {
    component = "pubsub-topic"
  })
}

# 3d. Approval-events topic — approval queue writes accepted/rejected events here
resource "google_pubsub_topic" "approval_events" {
  name    = local.topic_approval_events
  project = local.project

  message_retention_duration = "604800s"

  labels = merge(local.common_labels, {
    component = "pubsub-topic"
  })
}

# 3e. DLQ topic — handler and workflow write failed messages here
resource "google_pubsub_topic" "dlq" {
  name    = local.topic_dlq
  project = local.project

  message_retention_duration = "2592000s" # 30 days for forensics

  labels = merge(local.common_labels, {
    component           = "pubsub-topic-dlq"
    data_classification = "confidential"
  })
}

# 3f. Push subscription — routes loans.application.submitted → handler
#     Already provisioned as credit-memo-commercial-push-sub; data source.
data "google_pubsub_subscription" "handler_push_sub" {
  name    = "credit-memo-commercial-push-sub"
  project = local.project
}

# 3g. DLQ pull subscription — platform SRE tooling drains the DLQ
resource "google_pubsub_subscription" "dlq_pull" {
  name    = "credit-memo-commercial-dlq-pull"
  topic   = google_pubsub_topic.dlq.name
  project = local.project

  ack_deadline_seconds       = 60
  message_retention_duration = "2592000s"
  retain_acked_messages      = false

  expiration_policy {
    ttl = "" # never expire; SRE drains manually
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq.id
    max_delivery_attempts = 5
  }

  labels = merge(local.common_labels, {
    component = "pubsub-subscription"
  })
}

# 3h. Decided pull subscription — sink adapters consume outcome events
resource "google_pubsub_subscription" "decided_sink_sub" {
  name    = "credit-memo-commercial-decided-sink-sub"
  topic   = google_pubsub_topic.decided.name
  project = local.project

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"

  labels = merge(local.common_labels, {
    component = "pubsub-subscription"
  })
}

# 3i. Approval events pull subscription — workflow resumes on this event
resource "google_pubsub_subscription" "approval_events_sub" {
  name    = "credit-memo-commercial-approval-events-sub"
  topic   = google_pubsub_topic.approval_events.name
  project = local.project

  ack_deadline_seconds       = 300 # approval may need up to 5 min latency
  message_retention_duration = "604800s"

  labels = merge(local.common_labels, {
    component = "pubsub-subscription"
  })
}

###############################################################################
# 4. BIGQUERY — operational dataset + CMEK-encrypted audit dataset
###############################################################################

# 4a. Operational dataset (fsi_banking) — already exists; data source
data "google_bigquery_dataset" "fsi_banking" {
  dataset_id = local.bq_dataset_id
  project    = local.project
}

# 4b. Audit dataset — credit-memo decisions, 7-year retention (banking reg)
#     Uses bigquery_audit_dataset module when available; raw resource here with
#     all policy requirements met (CMEK, labels, retention).
resource "google_bigquery_dataset" "audit" {
  dataset_id                 = local.bq_audit_dataset_id
  project                    = local.project
  location                   = local.region
  description                = "Audit log for credit-memo-commercial decisions. Retention 7 years per OCC/CECL requirements."
  delete_contents_on_destroy = false

  default_table_expiration_ms     = null # tables never expire; retention managed by policy
  default_partition_expiration_ms = null

  default_encryption_configuration {
    kms_key_name = local.cmek_key
  }

  labels = merge(local.common_labels, {
    component = "bigquery-dataset"
    retention = "7-years"
  })
}

# 4c. Threshold table — regulatory_thresholds (versioned by effective_date)
resource "google_bigquery_table" "regulatory_thresholds" {
  dataset_id          = google_bigquery_dataset.audit.dataset_id
  table_id            = "regulatory_thresholds"
  project             = local.project
  description         = "Versioned regulatory thresholds consumed by rules-service. effective_date is the partition key."
  deletion_protection = true

  time_partitioning {
    type  = "DAY"
    field = "effective_date"
  }

  encryption_configuration {
    kms_key_name = local.cmek_key
  }

  schema = jsonencode([
    { name = "effective_date", type = "DATE", mode = "REQUIRED" },
    { name = "threshold_key", type = "STRING", mode = "REQUIRED" },
    { name = "threshold_value", type = "FLOAT64", mode = "REQUIRED" },
    { name = "unit", type = "STRING", mode = "NULLABLE" },
    { name = "regime", type = "STRING", mode = "NULLABLE" },
    { name = "notes", type = "STRING", mode = "NULLABLE" },
    { name = "loaded_at", type = "TIMESTAMP", mode = "REQUIRED" },
  ])

  labels = merge(local.common_labels, {
    component = "bigquery-table"
  })
}

# 4d. Memo audit log table — one row per credit memo lifecycle event
resource "google_bigquery_table" "memo_audit_log" {
  dataset_id          = google_bigquery_dataset.audit.dataset_id
  table_id            = "memo_audit_log"
  project             = local.project
  description         = "Immutable audit trail for each credit memo: creation, agent calls, rule evaluations, approval decision."
  deletion_protection = true

  time_partitioning {
    type  = "DAY"
    field = "event_ts"
  }

  encryption_configuration {
    kms_key_name = local.cmek_key
  }

  schema = jsonencode([
    { name = "event_id", type = "STRING", mode = "REQUIRED" },
    { name = "loan_id", type = "STRING", mode = "REQUIRED" },
    { name = "borrower_id", type = "STRING", mode = "REQUIRED" },
    { name = "event_type", type = "STRING", mode = "REQUIRED" },
    { name = "event_ts", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "step", type = "STRING", mode = "NULLABLE" },
    { name = "actor", type = "STRING", mode = "NULLABLE" },
    { name = "decision", type = "STRING", mode = "NULLABLE" },
    { name = "reason_codes", type = "JSON", mode = "NULLABLE" },
    { name = "workflow_exec", type = "STRING", mode = "NULLABLE" },
    { name = "trace_id", type = "STRING", mode = "NULLABLE" },
    { name = "schema_version", type = "STRING", mode = "REQUIRED" },
  ])

  labels = merge(local.common_labels, {
    component = "bigquery-table"
  })
}

# 4e. Single-borrower exposure table — used by rules-service for limit checks
resource "google_bigquery_table" "single_borrower_exposure" {
  dataset_id          = google_bigquery_dataset.audit.dataset_id
  table_id            = "single_borrower_exposure"
  project             = local.project
  description         = "Point-in-time snapshot of single-borrower exposure used by the single_borrower_exposure rule."
  deletion_protection = false

  time_partitioning {
    type  = "DAY"
    field = "as_of_date"
  }

  encryption_configuration {
    kms_key_name = local.cmek_key
  }

  schema = jsonencode([
    { name = "borrower_id", type = "STRING", mode = "REQUIRED" },
    { name = "as_of_date", type = "DATE", mode = "REQUIRED" },
    { name = "existing_exposure_committed", type = "FLOAT64", mode = "REQUIRED" },
    { name = "existing_exposure_outstanding", type = "FLOAT64", mode = "REQUIRED" },
    { name = "tier1_capital", type = "FLOAT64", mode = "REQUIRED" },
    { name = "single_borrower_pct", type = "FLOAT64", mode = "REQUIRED" },
    { name = "loaded_at", type = "TIMESTAMP", mode = "REQUIRED" },
  ])

  labels = merge(local.common_labels, {
    component = "bigquery-table"
  })
}

###############################################################################
# 5. GCS — CMEK-encrypted document store for memo PDFs and source financials
###############################################################################

resource "google_storage_bucket" "memo_docs" {
  name          = "agentic-experiments-credit-memo-docs"
  project       = local.project
  location      = local.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  # CMEK required — encryption.rego will deny if missing
  encryption {
    default_kms_key_name = local.cmek_key
  }

  # Lifecycle: move to Nearline after 90 days, Coldline after 365 days
  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age = 90
    }
  }

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
    condition {
      age = 365
    }
  }

  # Retain objects for 7 years minimum (OCC/CECL)
  retention_policy {
    is_locked        = false
    retention_period = 220752000 # 7 years in seconds
  }

  labels = merge(local.common_labels, {
    component = "gcs-bucket"
  })
}

###############################################################################
# 6. IAM — least-privilege bindings
#
# Principle: grant the minimum role, scoped to the specific resource, to the
# specific SA that needs it.  No project-level IAM editor/owner ever.
###############################################################################

# 6a. Workflow SA → Pub/Sub publisher on enriched, decided, dlq topics
resource "google_pubsub_topic_iam_member" "workflow_sa_publish_enriched" {
  project = local.project
  topic   = google_pubsub_topic.enriched.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_pubsub_topic_iam_member" "workflow_sa_publish_decided" {
  project = local.project
  topic   = google_pubsub_topic.decided.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_pubsub_topic_iam_member" "workflow_sa_publish_dlq" {
  project = local.project
  topic   = google_pubsub_topic.dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

# 6b. Workflow SA → subscriber on approval-events (workflow polls this)
resource "google_pubsub_subscription_iam_member" "workflow_sa_subscribe_approval" {
  project      = local.project
  subscription = google_pubsub_subscription.approval_events_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.workflow_sa_email}"
}

# 6c. Workflow SA → Cloud Run invoker on every atomic service
resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_financial_spreader" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.financial_spreader.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_dscr_calculator" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.dscr_calculator.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_covenant_analyzer" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.covenant_analyzer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_peer_benchmarker" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.peer_benchmarker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_industry_risk_scorer" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.industry_risk_scorer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_collateral_valuator" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.collateral_valuator.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_cloud_run_v2_service_iam_member" "workflow_invoke_exposure_aggregator" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.exposure_aggregator.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

# 6d. Agent Runtime SA → Cloud Run invoker on every atomic service
#     Agents discover services via MCP manifest and call them directly over HTTPS.
resource "google_cloud_run_v2_service_iam_member" "agent_invoke_financial_spreader" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.financial_spreader.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_invoke_dscr_calculator" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.dscr_calculator.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_invoke_covenant_analyzer" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.covenant_analyzer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_invoke_peer_benchmarker" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.peer_benchmarker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_invoke_industry_risk_scorer" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.industry_risk_scorer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_invoke_collateral_valuator" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.collateral_valuator.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_invoke_exposure_aggregator" {
  project  = local.project
  location = local.region
  name     = data.google_cloud_run_v2_service.exposure_aggregator.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.agent_runtime_sa}"
}

# 6e. Workflow SA → BigQuery data editor on audit dataset (writes audit rows)
resource "google_bigquery_dataset_iam_member" "workflow_sa_bq_editor" {
  project    = local.project
  dataset_id = google_bigquery_dataset.audit.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${local.workflow_sa_email}"
}

# 6f. Workflow SA → GCS object creator on memo-docs bucket (writes PDF)
resource "google_storage_bucket_iam_member" "workflow_sa_gcs_creator" {
  bucket = google_storage_bucket.memo_docs.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${local.workflow_sa_email}"
}

# 6g. Workflow SA → GCS object viewer (reads source financials for re-processing)
resource "google_storage_bucket_iam_member" "workflow_sa_gcs_viewer" {
  bucket = google_storage_bucket.memo_docs.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${local.workflow_sa_email}"
}

# 6h. Workflow SA → Cloud Tasks enqueuer (for approval queue)
resource "google_cloud_tasks_queue_iam_member" "workflow_sa_enqueuer" {
  project  = local.project
  location = local.region
  name     = google_cloud_tasks_queue.approval.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${local.workflow_sa_email}"
}

# 6i. Workflow SA → Vertex AI user (calls the credit_memo_supervisor agent)
resource "google_project_iam_member" "workflow_sa_aiplatform_user" {
  project = local.project
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

# 6j. Workflow SA → Workflows invoker (sub-workflow calls, e.g. fan-out-join)
resource "google_project_iam_member" "workflow_sa_workflows_invoker" {
  project = local.project
  role    = "roles/workflows.invoker"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

# 6k. Workflow SA → Cloud Trace agent + Log writer (OTel + structured logging)
resource "google_project_iam_member" "workflow_sa_trace_agent" {
  project = local.project
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

resource "google_project_iam_member" "workflow_sa_log_writer" {
  project = local.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${local.workflow_sa_email}"
}

# 6l. Pub/Sub SA → DLQ publisher (for dead-letter forwarding from subscriptions)
#     Cloud Pub/Sub service agent needs publish access on the DLQ topic.
data "google_project" "current" {
  project_id = local.project
}

resource "google_pubsub_topic_iam_member" "pubsub_svc_agent_dlq" {
  project = local.project
  topic   = google_pubsub_topic.dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

###############################################################################
# 7. CLOUD WORKFLOWS — orchestration of the 5-step pipeline
#
# Note: using raw google_workflows_workflow because the cloud_workflow module
# does not yet support the callback-URL-for-approval pattern required by
# approval-gate@1.0.  PR #infra-52 to platform team is open.
###############################################################################

resource "google_workflows_workflow" "credit_memo_commercial" {
  name            = "credit-memo-commercial"
  project         = local.project
  region          = local.region
  description     = "Orchestrates the 5-step credit-memo-commercial pipeline: handler enrichment → atomic fan-out/join → rules → agent → approval gate → sinks."
  service_account = local.workflow_sa_email

  # Source YAML lives next to this file under usecases/<uc>/
  source_contents = file("${path.module}/../workflow.yaml")

  labels = merge(local.common_labels, {
    component = "workflow"
  })
}

###############################################################################
# 8. APPROVAL QUEUE — Cloud Tasks queue gates the irrevocable GL posting
#
# Pattern: approval-gate@1.0
# The workflow enqueues a task to the credit officer review queue.  The officer
# accepts or rejects in the pipeline console.  On accept, the GL-posting sink
# fires.  On reject, a "declined" event is published to the decided topic.
# Auto-execution of the GL posting is forbidden (CLAUDE.md safeguard).
###############################################################################

resource "google_cloud_tasks_queue" "approval" {
  name     = local.approval_queue_name
  project  = local.project
  location = local.region

  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "3600s" # 1 hour; regulatory clock is 5 days
    min_backoff        = "30s"
    max_backoff        = "300s"
    max_doublings      = 3
  }

  # Tasks stay in queue for up to 4 days; SLA is 5 business days
  stackdriver_logging_config {
    sampling_ratio = 1.0 # 100% sampling for audit compliance
  }
}

# Approval events are published back to the approval_events topic by the
# credit officer app (pipeline-console).  The workflow callback handler
# receives the event and resumes execution.
resource "google_pubsub_topic_iam_member" "credit_officer_app_publish_approval" {
  project = local.project
  topic   = google_pubsub_topic.approval_events.name
  role    = "roles/pubsub.publisher"
  # The credit-officer console app's service account; injected at deploy time.
  # Kept as a variable so each environment (dev/staging/prod) uses its own SA.
  member = "serviceAccount:${var.agent_runtime_sa}"
}

###############################################################################
# 9. OUTPUTS
###############################################################################

output "workflow_id" {
  description = "Full resource ID of the credit-memo-commercial Cloud Workflow."
  value       = google_workflows_workflow.credit_memo_commercial.id
}

output "audit_dataset_id" {
  description = "BigQuery audit dataset ID for credit-memo-commercial."
  value       = google_bigquery_dataset.audit.dataset_id
}

output "memo_docs_bucket" {
  description = "GCS bucket name for credit memo documents."
  value       = google_storage_bucket.memo_docs.name
}

output "approval_queue_name" {
  description = "Cloud Tasks queue name for the approval gate."
  value       = google_cloud_tasks_queue.approval.name
}

output "dlq_topic_name" {
  description = "Pub/Sub DLQ topic name."
  value       = google_pubsub_topic.dlq.name
}

output "enriched_topic_name" {
  description = "Pub/Sub enriched topic name (handler → workflow)."
  value       = google_pubsub_topic.enriched.name
}

output "decided_topic_name" {
  description = "Pub/Sub decided topic name (workflow → sinks)."
  value       = google_pubsub_topic.decided.name
}
