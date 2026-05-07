output "workflow_id" {
  value = google_workflows_workflow.workflow.id
}

output "workflow_name" {
  value = google_workflows_workflow.workflow.name
}

output "workflow_sa_email" {
  value = google_service_account.workflow.email
}
