# =============================================================================
# outputs.tf — everything the env layer and CD pipeline need.
# =============================================================================

output "project_id" {
  description = "Project ID this environment was provisioned into."
  value       = var.project_id
}

output "region" {
  description = "Region used for all regional resources."
  value       = var.region
}

# --- Artifact Registry ------------------------------------------------------

output "artifact_registry_repo" {
  description = "Artifact Registry Docker repo name."
  value       = google_artifact_registry_repository.containers.repository_id
}

output "artifact_registry_path" {
  description = "Base image path: <region>-docker.pkg.dev/<project_id>/<repo>. Append /<service>:<git_sha>."
  value       = local.ar_path
}

output "agent_image" {
  description = "Resolved agent image reference deployed by this env."
  value       = local.agent_image
}

output "web_image" {
  description = "Resolved web image reference deployed by this env."
  value       = local.web_image
}

# --- Cloud Run service URLs -------------------------------------------------

output "agent_service_url" {
  description = "Deployed agent Cloud Run URL. PRIVATE — only the web runtime SA may invoke it. Injected into the web service as the runtime env var AGENT_URL (not a build arg)."
  value       = google_cloud_run_v2_service.agent.uri
}

# Convenience alias matching the web service's AGENT_URL env var name.
output "agent_url" {
  description = "Alias of agent_service_url — the value wired into the web service's runtime AGENT_URL env var."
  value       = google_cloud_run_v2_service.agent.uri
}

output "web_service_url" {
  description = "Deployed web Cloud Run URL (browser-facing, same-origin BFF)."
  value       = google_cloud_run_v2_service.web.uri
}

output "agent_service_name" {
  description = "Agent Cloud Run service name (for CD 'gcloud run deploy'/'services update')."
  value       = google_cloud_run_v2_service.agent.name
}

output "web_service_name" {
  description = "Web Cloud Run service name (for CD)."
  value       = google_cloud_run_v2_service.web.name
}

# --- Service accounts -------------------------------------------------------

output "agent_runtime_service_account" {
  description = "Email of the agent service's least-priv runtime SA."
  value       = google_service_account.agent_runtime.email
}

output "web_runtime_service_account" {
  description = "Email of the web service's least-priv runtime SA."
  value       = google_service_account.web_runtime.email
}

# --- Cloud SQL --------------------------------------------------------------

output "sql_instance_name" {
  description = "Cloud SQL Postgres instance name."
  value       = google_sql_database_instance.pg.name
}

output "sql_connection_name" {
  description = "Cloud SQL connection name (project:region:instance) for the /cloudsql socket."
  value       = google_sql_database_instance.pg.connection_name
}

output "sql_database_name" {
  description = "Postgres database used by the LangGraph checkpointer."
  value       = google_sql_database.langgraph.name
}

output "sql_user_name" {
  description = "Postgres application user."
  value       = google_sql_user.agent.name
}

# --- Secrets ----------------------------------------------------------------

output "database_uri_secret_id" {
  description = "Secret Manager secret id holding the agent's DATABASE_URI."
  value       = google_secret_manager_secret.database_uri.secret_id
}

output "database_uri" {
  description = "Full DATABASE_URI (postgresql:// via the /cloudsql unix socket). SENSITIVE — embeds the DB password."
  value       = local.database_uri
  sensitive   = true
}

output "optional_secret_ids" {
  description = "Map of env-var name -> Secret Manager secret id for module-created optional secrets (LANGSMITH etc.)."
  value       = { for k, s in google_secret_manager_secret.optional : k => s.secret_id }
}

# --- RFP document storage ---------------------------------------------------

output "rfp_bucket" {
  description = "GCS bucket name for uploaded RFP PDFs (null if create_rfp_bucket = false). Wired into both services as RFP_BUCKET."
  value       = local.rfp_bucket
}

# --- Memorystore (Redis) ----------------------------------------------------

output "redis_host" {
  description = "Private IP host of the Memorystore Redis instance (reachable from the VPC)."
  value       = google_redis_instance.cache.host
}

output "redis_port" {
  description = "Memorystore Redis port."
  value       = google_redis_instance.cache.port
}

output "redis_uri" {
  description = "REDIS_URI wired into the agent (redis://host:port over the peered VPC). SENSITIVE if you later enable AUTH."
  value       = local.redis_uri
}

# --- Network ----------------------------------------------------------------

output "network_id" {
  description = "VPC id used for Cloud Run Direct VPC egress and as the Memorystore authorized network."
  value       = local.network_id
}

output "agent_egress_subnet_id" {
  description = "Subnet id the agent's Direct VPC egress draws instance IPs from."
  value       = local.egress_subnet_id
}
