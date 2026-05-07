# Outputs consumed by use-case Terraform via data sources.

output "cloud_sql_instance_connection_name" {
  description = "Cloud SQL instance connection name (for INSTANCE_CONNECTION_NAME env var)."
  value       = google_sql_database_instance.fsi_banking.connection_name
}

output "cloud_sql_instance_name" {
  description = "Cloud SQL instance short name."
  value       = google_sql_database_instance.fsi_banking.name
}

output "db_password_secret_id" {
  description = "Secret Manager secret ID for the database password."
  value       = google_secret_manager_secret.db_pass.secret_id
}

output "vpc_id" {
  description = "VPC self-link for the FSI network."
  value       = google_compute_network.fsi.id
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector ID for Cloud Run."
  value       = google_vpc_access_connector.fsi.id
}
