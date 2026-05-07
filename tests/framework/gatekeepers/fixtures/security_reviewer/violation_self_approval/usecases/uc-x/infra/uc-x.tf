# Terraform with the SELF-APPROVAL violation: the agent runtime SA can publish
# to approval_events, letting the agent fabricate approvals and bypass dual control.

variable "agent_runtime_sa" {
  type        = string
  description = "Agent runtime service account email."
}

resource "google_pubsub_topic" "approval_events" {
  name = "uc-x-approval-events"
}

resource "google_pubsub_topic_iam_member" "approval_publisher" {
  topic  = google_pubsub_topic.approval_events.name
  role   = "roles/pubsub.publisher"
  # VIOLATION: agent_runtime_sa should NOT have publisher on approval_events.
  # The credit-officer console SA is the only identity allowed to publish here.
  member = "serviceAccount:${var.agent_runtime_sa}"
}
