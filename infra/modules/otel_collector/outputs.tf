output "endpoint" {
  value       = google_cloud_run_v2_service.collector.uri
  description = "OTEL_EXPORTER_OTLP_ENDPOINT for atomic services and handlers to use."
}

output "service_account_email" {
  value = google_service_account.otel.email
}

output "name" {
  value = google_cloud_run_v2_service.collector.name
}
