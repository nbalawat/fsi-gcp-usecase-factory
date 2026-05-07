package main

# Tests for encryption.rego — CMEK enforcement on customer data stores.

# ── BigQuery dataset ──────────────────────────────────────────────────────

test_bq_dataset_without_cmek_is_denied {
    deny["BigQuery dataset google_bigquery_dataset.audit missing default_encryption_configuration (CMEK required for customer data)."] with input as {
        "resource_changes": [{
            "address": "google_bigquery_dataset.audit",
            "type": "google_bigquery_dataset",
            "change": {"after": {"dataset_id": "audit"}},
        }],
    }
}

test_bq_dataset_with_cmek_is_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_bigquery_dataset.audit",
            "type": "google_bigquery_dataset",
            "change": {"after": {
                "dataset_id": "audit",
                "default_encryption_configuration": [{"kms_key_name": "projects/p/locations/l/keyRings/r/cryptoKeys/k"}],
            }},
        }],
    }
}

# ── GCS bucket ────────────────────────────────────────────────────────────

test_gcs_bucket_without_encryption_is_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_storage_bucket.docs",
            "type": "google_storage_bucket",
            "change": {"after": {"name": "uc-docs", "labels": {"data_classification": "confidential"}}},
        }],
    }
    contains(msg, "Storage bucket")
    contains(msg, "missing encryption")
}

test_gcs_bucket_public_label_allowed_without_encryption {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_storage_bucket.public_assets",
            "type": "google_storage_bucket",
            "change": {"after": {"name": "public-assets", "labels": {"data_classification": "public"}}},
        }],
    }
}

# ── Cloud SQL ─────────────────────────────────────────────────────────────

test_cloud_sql_without_cmek_is_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_sql_database_instance.fsi_banking",
            "type": "google_sql_database_instance",
            "change": {"after": {"name": "fsi-banking-dev"}},
        }],
    }
    contains(msg, "Cloud SQL instance")
    contains(msg, "encryption_key_name")
}

test_cloud_sql_with_cmek_is_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_sql_database_instance.fsi_banking",
            "type": "google_sql_database_instance",
            "change": {"after": {
                "name": "fsi-banking-dev",
                "encryption_key_name": "projects/p/locations/l/keyRings/r/cryptoKeys/k",
            }},
        }],
    }
}

# ── Bigtable ──────────────────────────────────────────────────────────────

test_bigtable_cluster_without_cmek_is_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_bigtable_instance.memory",
            "type": "google_bigtable_instance",
            "change": {"after": {"name": "memory", "cluster": [{"cluster_id": "c1"}]}},
        }],
    }
    contains(msg, "Bigtable cluster")
}
