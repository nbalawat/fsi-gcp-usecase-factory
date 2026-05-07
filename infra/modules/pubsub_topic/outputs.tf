output "name" {
  value = google_pubsub_topic.topic.name
}

output "id" {
  value = google_pubsub_topic.topic.id
}

output "topic_path" {
  value = "projects/${var.project}/topics/${google_pubsub_topic.topic.name}"
}
