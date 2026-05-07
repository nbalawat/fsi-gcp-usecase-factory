output "name" {
  value = google_cloud_run_v2_service.handler.name
}

output "url" {
  value = google_cloud_run_v2_service.handler.uri
}

output "service_account_email" {
  value       = google_service_account.handler.email
  description = "Identity the handler runs under."
}

output "pubsub_invoker_sa_email" {
  value       = google_service_account.pubsub_invoker.email
  description = "Identity Pub/Sub uses to call the handler with OIDC."
}

output "subscription_name" {
  value = google_pubsub_subscription.push.name
}
