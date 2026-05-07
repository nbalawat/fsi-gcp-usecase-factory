package main

# Database services must not have public IPs.
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_sql_database_instance"
    settings := resource.change.after.settings[_]
    ip_config := settings.ip_configuration[_]
    ip_config.ipv4_enabled == true
    msg := sprintf(
        "Cloud SQL instance %s has public IP enabled (ipv4_enabled=true). Banks require private-only IPs on databases.",
        [resource.address],
    )
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_alloydb_instance"
    network := resource.change.after.network_config[_]
    network.enable_public_ip == true
    msg := sprintf(
        "AlloyDB instance %s has public IP enabled. Use private IPs only.",
        [resource.address],
    )
}

# Cloud Run services that aren't customer-facing should be internal-only.
warn[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_cloud_run_v2_service"
    resource.change.after.ingress != "INGRESS_TRAFFIC_INTERNAL_ONLY"
    resource.change.after.ingress != "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    not resource.change.after.labels.public_facing == "true"
    msg := sprintf(
        "Cloud Run service %s allows external ingress. If not customer-facing, set ingress=INGRESS_TRAFFIC_INTERNAL_ONLY.",
        [resource.address],
    )
}
