output "name" {
  value       = google_cloud_run_v2_service.service.name
  description = "Cloud Run service short name (e.g. fsi-atomic-dscr-calculator)."
}

output "url" {
  value       = google_cloud_run_v2_service.service.uri
  description = "Cloud Run service URL (auth required)."
}

output "service_account_email" {
  value       = google_service_account.service.email
  description = "Email of the dedicated service account for this service."
}

output "service_account_id" {
  value       = google_service_account.service.id
  description = "Full resource ID of the service account."
}

output "location" {
  value       = google_cloud_run_v2_service.service.location
  description = "Region the service is deployed in."
}
