output "name" {
  value = google_cloud_run_v2_service.sink.name
}

output "url" {
  value = google_cloud_run_v2_service.sink.uri
}

output "service_account_email" {
  value = google_service_account.sink.email
}

output "subscription_name" {
  value = google_pubsub_subscription.sink_sub.name
}
