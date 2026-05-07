package main

# Tests for tagging.rego — required labels + valid classifications.

required := {"use_case", "component", "owner", "cost_center", "data_classification"}

test_missing_labels_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_pubsub_topic.bad",
            "type": "google_pubsub_topic",
            "change": {"after": {"name": "x", "labels": {"use_case": "uc-x"}}},
        }],
    }
    contains(msg, "missing required labels")
}

test_all_required_labels_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_pubsub_topic.good",
            "type": "google_pubsub_topic",
            "change": {"after": {
                "name": "uc-x.enriched",
                "labels": {
                    "use_case": "uc-x",
                    "component": "topic",
                    "owner": "platform",
                    "cost_center": "cc-1",
                    "data_classification": "confidential",
                },
            }},
        }],
    }
}

test_invalid_classification_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_storage_bucket.bad",
            "type": "google_storage_bucket",
            "change": {"after": {
                "name": "uc-docs",
                "encryption": [{"default_kms_key_name": "k"}],
                "labels": {
                    "use_case": "uc-x",
                    "component": "bucket",
                    "owner": "platform",
                    "cost_center": "cc-1",
                    "data_classification": "ultra-secret",
                },
            }},
        }],
    }
    contains(msg, "invalid data_classification")
}
