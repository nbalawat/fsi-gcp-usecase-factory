output "instance_name" {
  value = google_bigtable_instance.memory.name
}

output "cluster_id" {
  value = var.cluster_id
}

output "table_names" {
  value = { for k, v in google_bigtable_table.memory_tables : k => v.name }
}
