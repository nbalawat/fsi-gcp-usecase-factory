# secret — Secret Manager secret + version + IAM accessor bindings.

locals {
  labels = {
    use_case            = var.use_case
    component           = "secret"
    owner               = var.owner
    cost_center         = var.cost_center
    data_classification = var.data_classification
  }
}

resource "google_secret_manager_secret" "secret" {
  secret_id = var.secret_id
  project   = var.project
  labels    = local.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "version" {
  secret      = google_secret_manager_secret.secret.id
  secret_data = var.secret_data
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = toset(var.accessor_sa_emails)
  project   = var.project
  secret_id = google_secret_manager_secret.secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}
