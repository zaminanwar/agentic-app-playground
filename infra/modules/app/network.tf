# =============================================================================
# network.tf — VPC + Memorystore (Redis) for the self-hosted LangGraph server.
#
# The standalone LangGraph Agent Server REQUIRES Redis (pub/sub + background-run
# task queue) in addition to Postgres. Memorystore exposes only a PRIVATE IP, so
# the agent Cloud Run service reaches it over a VPC via Direct VPC egress
# (no Serverless VPC Access connector to manage).
#
# Connectivity model (Direct VPC egress):
#   agent Cloud Run  --(network_interface: this VPC/subnet)-->  VPC
#   VPC is the Memorystore instance's authorized_network (Redis Basic/Standard
#   uses VPC network peering), so the private Redis IP is routable.
#
# Cloud SQL Postgres stays on its own /cloudsql unix-socket path (independent of
# this VPC), so no change is needed there.
# =============================================================================

# ---------------------------------------------------------------------------
# VPC + subnet (created by default; bring-your-own via create_network=false)
# ---------------------------------------------------------------------------

resource "google_compute_network" "vpc" {
  count = var.create_network ? 1 : 0

  project                 = var.project_id
  name                    = var.network_name
  auto_create_subnetworks = false
  description             = "VPC for Cloud Run Direct VPC egress to private Memorystore (${var.env})."

  depends_on = [google_project_service.services]
}

# Subnet the agent's Direct VPC egress draws instance IPs from. Private Google
# Access lets VPC-routed traffic still reach Google APIs if egress=ALL_TRAFFIC.
resource "google_compute_subnetwork" "agent_egress" {
  count = var.create_network ? 1 : 0

  project                  = var.project_id
  name                     = "${var.network_name}-cloudrun"
  region                   = var.region
  network                  = google_compute_network.vpc[0].id
  ip_cidr_range            = var.agent_egress_subnet_cidr
  private_ip_google_access = true
}

# ---------------------------------------------------------------------------
# Memorystore for Redis — LangGraph server task queue / pub-sub (mandatory)
# ---------------------------------------------------------------------------
# Uses DIRECT_PEERING (the default for Basic/Standard): the instance peers with
# authorized_network, so the private host is reachable from that VPC's subnets.

resource "google_redis_instance" "cache" {
  project        = var.project_id
  name           = var.redis_instance_name
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = var.redis_version
  display_name   = "agentic-app LangGraph Redis (${var.env})"
  labels         = local.common_labels

  # Authorized network = the VPC the agent egresses into (peered, private IP).
  authorized_network = local.network_id

  # Private-IP-only over VPC peering; no public endpoint.
  connect_mode = "DIRECT_PEERING"

  # NOTE: auth_enabled defaults to false. The instance is only reachable from
  # inside the peered VPC, so REDIS_URI is a plain redis:// URL. To require an
  # AUTH string, set auth_enabled=true and move REDIS_URI into Secret Manager.

  depends_on = [google_project_service.services]
}
