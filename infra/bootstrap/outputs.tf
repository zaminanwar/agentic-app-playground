# =============================================================================
# outputs.tf (bootstrap) — values the CD workflow and env layers consume.
# =============================================================================

output "workload_identity_provider" {
  description = <<-EOT
    Full resource name of the WIF provider for the google-github-actions/auth
    step (the `workload_identity_provider` input). Format:
    projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>.
  EOT
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "workload_identity_pool_name" {
  description = "Full resource name of the WIF pool."
  value       = google_iam_workload_identity_pool.github.name
}

output "deployer_service_account_dev" {
  description = "Dev deployer SA email — the `service_account` input to google-github-actions/auth for dev deploys."
  value       = google_service_account.deployer_dev.email
}

output "deployer_service_account_prod" {
  description = "Prod deployer SA email — the `service_account` input for prod (promotion) deploys."
  value       = google_service_account.deployer_prod.email
}

output "tfstate_bucket_dev" {
  description = "Dev terraform state bucket (matches infra/envs/dev/backend.tf)."
  value       = google_storage_bucket.tfstate_dev.name
}

output "tfstate_bucket_prod" {
  description = "Prod terraform state bucket (matches infra/envs/prod/backend.tf)."
  value       = google_storage_bucket.tfstate_prod.name
}

output "github_repository" {
  description = "owner/repo the WIF provider is restricted to."
  value       = local.github_repo_full
}
