package main

# Tests for iam.rego — forbidden over-broad IAM roles.

test_forbidden_owner_role_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_project_iam_member.bad",
            "type": "google_project_iam_member",
            "change": {"after": {"role": "roles/owner", "member": "serviceAccount:x@y.iam.gserviceaccount.com"}},
        }],
    }
    contains(msg, "roles/owner")
    contains(msg, "forbidden")
}

test_forbidden_editor_role_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_project_iam_member.bad",
            "type": "google_project_iam_member",
            "change": {"after": {"role": "roles/editor", "member": "serviceAccount:x@y.iam.gserviceaccount.com"}},
        }],
    }
    contains(msg, "roles/editor")
}

test_forbidden_security_admin_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_project_iam_binding.bad",
            "type": "google_project_iam_binding",
            "change": {"after": {"role": "roles/iam.securityAdmin"}},
        }],
    }
    contains(msg, "roles/iam.securityAdmin")
}

test_narrow_role_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_project_iam_member.run_invoker",
            "type": "google_project_iam_member",
            "change": {"after": {"role": "roles/run.invoker", "member": "serviceAccount:x@y.iam.gserviceaccount.com"}},
        }],
    }
}
