package main

# Required labels on all bank resources.
required_labels := {"use_case", "component", "owner", "cost_center", "data_classification"}

valid_classifications := {"public", "internal", "confidential", "restricted"}

# Resource types that must carry the bank's labels
labeled_resource_types := {
    "google_cloud_run_v2_service",
    "google_pubsub_topic",
    "google_pubsub_subscription",
    "google_bigquery_dataset",
    "google_storage_bucket",
    "google_sql_database_instance",
    "google_bigtable_instance",
    "google_workflows_workflow",
}

deny[msg] {
    resource := input.resource_changes[_]
    labeled_resource_types[resource.type]
    labels := object.get(resource.change.after, "labels", {})
    missing := required_labels - {k | labels[k]}
    count(missing) > 0
    msg := sprintf(
        "Resource %s missing required labels: %v",
        [resource.address, missing],
    )
}

deny[msg] {
    resource := input.resource_changes[_]
    labeled_resource_types[resource.type]
    classification := object.get(resource.change.after.labels, "data_classification", "")
    classification != ""
    not valid_classifications[classification]
    msg := sprintf(
        "Resource %s has invalid data_classification %q. Must be one of: %v",
        [resource.address, classification, valid_classifications],
    )
}
