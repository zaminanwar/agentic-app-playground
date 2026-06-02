# =============================================================================
# outputs.tf (dev) — re-export the module outputs CD and operators need.
# =============================================================================

output "project_id" {
  description = "Dev project ID."
  value       = module.app.project_id
}

output "region" {
  description = "Region."
  value       = module.app.region
}

output "artifact_registry_repo" {
  description = "Artifact Registry Docker repo name."
  value       = module.app.artifact_registry_repo
}

output "artifact_registry_path" {
  description = "Base image path: <region>-docker.pkg.dev/<project_id>/<repo>. Append /<service>:<git_sha>."
  value       = module.app.artifact_registry_path
}

output "agent_image" {
  description = "Resolved agent image reference deployed to dev."
  value       = module.app.agent_image
}

output "web_image" {
  description = "Resolved web image reference deployed to dev."
  value       = module.app.web_image
}

output "agent_service_url" {
  description = "Deployed agent Cloud Run URL (PRIVATE). Injected into web as the runtime AGENT_URL env var."
  value       = module.app.agent_service_url
}

output "agent_url" {
  description = "Alias of agent_service_url (the web service's AGENT_URL value)."
  value       = module.app.agent_url
}

output "web_service_url" {
  description = "Deployed web Cloud Run URL (browser-facing)."
  value       = module.app.web_service_url
}

output "agent_service_name" {
  description = "Agent Cloud Run service name (for CD)."
  value       = module.app.agent_service_name
}

output "web_service_name" {
  description = "Web Cloud Run service name (for CD)."
  value       = module.app.web_service_name
}

output "agent_runtime_service_account" {
  description = "Agent runtime SA email."
  value       = module.app.agent_runtime_service_account
}

output "web_runtime_service_account" {
  description = "Web runtime SA email."
  value       = module.app.web_runtime_service_account
}

output "sql_connection_name" {
  description = "Cloud SQL connection name (project:region:instance) for the /cloudsql socket."
  value       = module.app.sql_connection_name
}

output "sql_instance_name" {
  description = "Cloud SQL Postgres instance name."
  value       = module.app.sql_instance_name
}

output "database_uri_secret_id" {
  description = "Secret Manager secret id holding the agent's DATABASE_URI."
  value       = module.app.database_uri_secret_id
}

output "optional_secret_ids" {
  description = "Map of env-var name -> Secret Manager secret id for module-created optional secrets."
  value       = module.app.optional_secret_ids
}

output "redis_host" {
  description = "Private IP host of the Memorystore Redis instance."
  value       = module.app.redis_host
}

output "network_id" {
  description = "VPC used for Cloud Run Direct VPC egress / Memorystore authorized network."
  value       = module.app.network_id
}
