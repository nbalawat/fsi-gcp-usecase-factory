output "agent_runtime_sa_email" {
  value       = google_service_account.agent.email
  description = "The agent runtime's service account. Used by the workflow's run.invoker binding."
}

output "agent_runtime_sa_id" {
  value = google_service_account.agent.id
}
