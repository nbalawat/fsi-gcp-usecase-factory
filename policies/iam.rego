package main

# Deny over-broad IAM bindings on service accounts.
# Banking service accounts must use roles narrowly scoped to specific resources.

forbidden_roles := {
    "roles/owner",
    "roles/editor",
    "roles/iam.securityAdmin",
    "roles/resourcemanager.projectIamAdmin",
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_project_iam_member"
    role := resource.change.after.role
    forbidden_roles[role]
    member := resource.change.after.member
    msg := sprintf(
        "IAM binding uses forbidden role %q on member %q (resource: %s). Use a narrower role scoped to specific resources.",
        [role, member, resource.address],
    )
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_project_iam_binding"
    role := resource.change.after.role
    forbidden_roles[role]
    msg := sprintf(
        "IAM binding uses forbidden role %q (resource: %s). Use a narrower role scoped to specific resources.",
        [role, resource.address],
    )
}

# Service accounts should not be shared across services.
# Each Cloud Run service should have its own SA.
warn[msg] {
    services := [r | r := input.resource_changes[_]; r.type == "google_cloud_run_v2_service"]
    count(services) > 1
    sa_count := count({sa | s := services[_]; sa := s.change.after.template[_].service_account})
    sa_count < count(services)
    msg := "Multiple Cloud Run services share a service account. Each service should have its own SA for least-privilege isolation."
}
