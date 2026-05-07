package main

# Tests for observability.rego — OTel collector required on every Cloud Run service.

test_cloud_run_without_otel_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_cloud_run_v2_service.bad",
            "type": "google_cloud_run_v2_service",
            "change": {"after": {
                "name": "fsi-atomic-x",
                "template": [{
                    "containers": [{"env": [{"name": "GCP_PROJECT", "value": "p"}]}],
                }],
            }},
        }],
    }
    contains(msg, "OTel collector env var")
}

test_cloud_run_with_otel_endpoint_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_cloud_run_v2_service.good",
            "type": "google_cloud_run_v2_service",
            "change": {"after": {
                "name": "fsi-atomic-x",
                "template": [{
                    "containers": [{"env": [
                        {"name": "GCP_PROJECT", "value": "p"},
                        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel:4317"},
                    ]}],
                }],
            }},
        }],
    }
}

test_cloud_run_with_otel_collector_endpoint_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_cloud_run_v2_service.good",
            "type": "google_cloud_run_v2_service",
            "change": {"after": {
                "name": "fsi-atomic-x",
                "template": [{
                    "containers": [{"env": [
                        {"name": "OTEL_COLLECTOR_ENDPOINT", "value": "http://otel:4317"},
                    ]}],
                }],
            }},
        }],
    }
}
