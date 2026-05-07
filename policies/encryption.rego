package main

# Customer data storage must use customer-managed encryption keys (CMEK).
# Applies to BigQuery datasets, Cloud Storage buckets, Cloud SQL/AlloyDB instances, Bigtable.

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_bigquery_dataset"
    not resource.change.after.default_encryption_configuration
    msg := sprintf(
        "BigQuery dataset %s missing default_encryption_configuration (CMEK required for customer data).",
        [resource.address],
    )
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_storage_bucket"
    not resource.change.after.encryption
    # Allow override for buckets explicitly tagged as non-customer
    not resource.change.after.labels.data_classification == "public"
    msg := sprintf(
        "Storage bucket %s missing encryption block (CMEK required unless data_classification=public).",
        [resource.address],
    )
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_sql_database_instance"
    not resource.change.after.encryption_key_name
    msg := sprintf(
        "Cloud SQL instance %s missing encryption_key_name (CMEK required).",
        [resource.address],
    )
}

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "google_bigtable_instance"
    cluster := resource.change.after.cluster[_]
    not cluster.kms_key_name
    msg := sprintf(
        "Bigtable cluster %s missing kms_key_name (CMEK required).",
        [resource.address],
    )
}
