output "secret_id" {
  value = google_secret_manager_secret.secret.secret_id
}

output "id" {
  value = google_secret_manager_secret.secret.id
}

output "version_id" {
  value = google_secret_manager_secret_version.version.id
}
