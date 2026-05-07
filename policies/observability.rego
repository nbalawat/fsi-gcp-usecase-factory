package main

# Cloud Run services must have OTel collector wiring (env var pointing at collector).
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_cloud_run_v2_service"
    template := resource.change.after.template[_]
    container := template.containers[_]
    env_vars := {e.name: e.value | e := container.env[_]}
    not env_vars["OTEL_EXPORTER_OTLP_ENDPOINT"]
    not env_vars["OTEL_COLLECTOR_ENDPOINT"]
    msg := sprintf(
        "Cloud Run service %s missing OTel collector env var (OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_COLLECTOR_ENDPOINT).",
        [resource.address],
    )
}

# Use cases that make decisions must have an audit dataset binding.
warn[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_workflows_workflow"
    name := resource.change.after.name
    # Look for any BigQuery dataset reference for audit
    audit_datasets := [r | r := input.resource_changes[_]
                          r.type == "google_bigquery_dataset"
                          contains(r.change.after.dataset_id, "audit")]
    count(audit_datasets) == 0
    msg := sprintf(
        "Workflow %s present but no audit BigQuery dataset declared. Decisions must be logged to audit.* tables.",
        [resource.address],
    )
}
