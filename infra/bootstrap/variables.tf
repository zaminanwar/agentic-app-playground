# =============================================================================
# variables.tf (bootstrap) — one-time WIF + tfstate-bucket + deployer-SA setup.
#
# This layer is applied ONCE per GCP org/project set, BEFORE the env layers,
# and it bootstraps the things the env layers and the CD pipeline depend on:
#   * the GCS tfstate buckets the env backends point at,
#   * the Workload Identity Federation pool/provider GitHub Actions auths against,
#   * the per-env deployer service accounts (gh-deployer@) with least privilege.
#
# Chicken-and-egg: this layer manages the very buckets used for remote state, so
# it intentionally starts on LOCAL state. See README.md.
# =============================================================================

variable "dev_project_id" {
  description = "GCP project ID for the dev environment."
  type        = string
  default     = "agentic-app-dev"
}

variable "prod_project_id" {
  description = "GCP project ID for the prod environment."
  type        = string
  default     = "agentic-app-prod"
}

variable "region" {
  description = "GCP region (also the GCS bucket location is derived from this)."
  type        = string
  default     = "us-central1"
}

variable "bucket_location" {
  description = "Location for the GCS tfstate buckets. US multi-region is durable and cheap; override to a single region if you require data residency."
  type        = string
  default     = "US"
}

# --- tfstate buckets (must match the env backend.tf literals) ---------------

variable "dev_state_bucket" {
  description = "GCS bucket name for DEV terraform state. Must match infra/envs/dev/backend.tf."
  type        = string
  default     = "agentic-app-tfstate-dev"
}

variable "prod_state_bucket" {
  description = "GCS bucket name for PROD terraform state. Must match infra/envs/prod/backend.tf."
  type        = string
  default     = "agentic-app-tfstate-prod"
}

# --- Workload Identity Federation -------------------------------------------

variable "wif_project_id" {
  description = "Project that HOSTS the Workload Identity pool/provider. Defaults to the dev project; the pool can be shared across envs since each deployer SA scopes its own access."
  type        = string
  default     = "agentic-app-dev"
}

variable "wif_pool_id" {
  description = "Workload Identity Pool ID. Convention: 'github-pool'."
  type        = string
  default     = "github-pool"
}

variable "wif_provider_id" {
  description = "Workload Identity Pool Provider ID. Convention: 'github-provider'."
  type        = string
  default     = "github-provider"
}

variable "github_owner" {
  description = "GitHub org/user that owns the repo (the 'owner' in owner/repo)."
  type        = string
  # TODO(decision): set to the real GitHub org/user that owns this repo.
  default     = "your-github-org"
}

variable "github_repo" {
  description = "GitHub repository name (without the owner)."
  type        = string
  default     = "agentic-app-playground"
}

variable "github_default_branch" {
  description = "Long-lived trunk branch. The provider attribute condition + SA binding restrict token issuance to this repo; deploys are gated further by GitHub Environments."
  type        = string
  default     = "main"
}

# --- Deployer service accounts ----------------------------------------------

variable "deployer_account_id" {
  description = "Account ID (local part) of the per-env deployer SA. Convention: 'gh-deployer' -> gh-deployer@<project_id>.iam.gserviceaccount.com."
  type        = string
  default     = "gh-deployer"
}

variable "deployer_roles" {
  description = "Least-privilege project roles granted to each deployer SA in its own project (deploy Cloud Run, push images, act-as runtime SAs, read/write secrets, manage Cloud SQL for the env layer)."
  type        = list(string)
  default = [
    "roles/run.admin",                  # deploy/update Cloud Run services
    "roles/artifactregistry.writer",    # push images to 'containers'
    "roles/iam.serviceAccountUser",     # actAs the runtime SAs on deploy
    "roles/secretmanager.admin",        # manage env-layer secrets (DATABASE_URI etc.)
    "roles/cloudsql.admin",             # env layer provisions Cloud SQL
    "roles/redis.admin",                # env layer provisions Memorystore (Redis)
    "roles/compute.networkAdmin",       # env layer creates the VPC/subnet for Direct VPC egress
    "roles/serviceusage.serviceUsageAdmin", # enable required APIs from the env layer
    "roles/storage.admin",              # read/write the env's tfstate bucket objects
    "roles/iam.serviceAccountAdmin",    # env layer creates the runtime SAs
    "roles/resourcemanager.projectIamAdmin", # env layer binds runtime SA project roles
  ]
}
