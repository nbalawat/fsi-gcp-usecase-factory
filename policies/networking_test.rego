package main

# Tests for networking.rego — private IPs only on databases.

test_cloud_sql_public_ip_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_sql_database_instance.bad",
            "type": "google_sql_database_instance",
            "change": {"after": {
                "name": "bad-db",
                "settings": [{"ip_configuration": [{"ipv4_enabled": true}]}],
            }},
        }],
    }
    contains(msg, "Cloud SQL instance")
    contains(msg, "public IP")
}

test_cloud_sql_private_only_allowed {
    count(deny) == 0 with input as {
        "resource_changes": [{
            "address": "google_sql_database_instance.fsi",
            "type": "google_sql_database_instance",
            "change": {"after": {
                "name": "fsi-banking-dev",
                "encryption_key_name": "projects/p/locations/l/keyRings/r/cryptoKeys/k",
                "settings": [{
                    "ip_configuration": [{
                        "ipv4_enabled": false,
                        "private_network": "projects/p/global/networks/fsi",
                    }],
                }],
            }},
        }],
    }
}

test_alloydb_public_ip_denied {
    some msg
    deny[msg] with input as {
        "resource_changes": [{
            "address": "google_alloydb_instance.bad",
            "type": "google_alloydb_instance",
            "change": {"after": {"network_config": [{"enable_public_ip": true}]}},
        }],
    }
    contains(msg, "AlloyDB")
}
