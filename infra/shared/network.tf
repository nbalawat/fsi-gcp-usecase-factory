# Private VPC + Cloud SQL private services connection.
# Cloud SQL must be on a private IP per bank policy; this requires VPC peering
# with the Google services range. Once allocated, all environments reuse it.

resource "google_compute_network" "fsi" {
  name                    = "fsi-banking-${var.environment}"
  auto_create_subnetworks = false
  project                 = var.project
}

resource "google_compute_subnetwork" "fsi" {
  name          = "fsi-banking-${var.environment}"
  ip_cidr_range = "10.20.0.0/24"
  region        = var.region
  network       = google_compute_network.fsi.id
  project       = var.project

  private_ip_google_access = true
}

# Reserved IP range for Cloud SQL private services connection.
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "fsi-banking-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.fsi.id
  project       = var.project
}

resource "google_service_networking_connection" "fsi" {
  network                 = google_compute_network.fsi.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# Serverless VPC Access connector — Cloud Run services use this to reach
# Cloud SQL on its private IP.
resource "google_vpc_access_connector" "fsi" {
  name          = "fsi-banking-${var.environment}"
  region        = var.region
  network       = google_compute_network.fsi.name
  ip_cidr_range = "10.21.0.0/28"
  project       = var.project
}
