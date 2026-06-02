# =============================================================================
# main.tf (bootstrap) — one-time foundation for CI/CD and remote state.
#
# Creates:
#   * GCS tfstate buckets (versioned) for dev and prod — the env backends.
#   * A Workload Identity Federation pool 'github-pool' + provider
#     'github-provider' restricted to THIS GitHub repo (NO long-lived JSON keys).
#   * A per-env deployer SA 'gh-deployer@<project>' with least-priv roles, each
#     bound so GitHub Actions running in this repo can impersonate it via WIF.
#
# CHICKEN-AND-EGG: this layer manages the buckets used for remote state, so it
# runs on LOCAL state (no backend block). See README.md for the workflow.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.40.0, < 7.0.0"
    }
  }

  # NOTE: intentionally NO backend block. Bootstrap uses LOCAL state because it
  # creates the very buckets a GCS backend would need. Commit the resulting
  # terraform.tfstate to a secure store, or migrate it into the dev state
  # bucket AFTER this apply (see README.md).
}

# Default provider points at the WIF-hosting project (the pool/provider live
# here). Per-env resources use the aliased providers below.
provider "google" {
  project = var.wif_project_id
  region  = var.region
}

provider "google" {
  alias   = "dev"
  project = var.dev_project_id
  region  = var.region
}

provider "google" {
  alias   = "prod"
  project = var.prod_project_id
  region  = var.region
}

locals {
  # GitHub OIDC subject for the trunk branch: "repo:<owner>/<repo>:ref:refs/heads/<branch>".
  github_repo_full = "${var.github_owner}/${var.github_repo}"

  # APIs the bootstrap itself needs enabled (IAM credentials for impersonation,
  # IAM API for SAs/WIF, storage for buckets, STS for token exchange).
  wif_project_services = toset([
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "storage.googleapis.com",
  ])

  env_project_services = toset([
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "storage.googleapis.com",
  ])
}

# ---------------------------------------------------------------------------
# Required API enablement
# ---------------------------------------------------------------------------

resource "google_project_service" "wif" {
  for_each = local.wif_project_services

  project            = var.wif_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_project_service" "dev" {
  provider = google.dev
  for_each = local.env_project_services

  project            = var.dev_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_project_service" "prod" {
  provider = google.prod
  for_each = local.env_project_services

  project            = var.prod_project_id
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# GCS tfstate buckets (one per env) — versioned, uniform access, no public.
# These are what infra/envs/<env>/backend.tf point at.
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "tfstate_dev" {
  provider = google.dev

  name                        = var.dev_state_bucket
  project                     = var.dev_project_id
  location                    = var.bucket_location
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  labels = {
    managed-by = "terraform-bootstrap"
    purpose    = "tfstate"
    env        = "dev"
  }

  depends_on = [google_project_service.dev]
}

resource "google_storage_bucket" "tfstate_prod" {
  provider = google.prod

  name                        = var.prod_state_bucket
  project                     = var.prod_project_id
  location                    = var.bucket_location
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  labels = {
    managed-by = "terraform-bootstrap"
    purpose    = "tfstate"
    env        = "prod"
  }

  depends_on = [google_project_service.prod]
}

# ---------------------------------------------------------------------------
# Workload Identity Federation — GitHub Actions OIDC, no JSON keys.
# Pool + provider live in the WIF-hosting project; the attribute condition
# hard-restricts token issuance to THIS repository.
# ---------------------------------------------------------------------------

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.wif_project_id
  workload_identity_pool_id = var.wif_pool_id
  display_name              = "GitHub Actions pool"
  description               = "WIF pool for GitHub Actions CI/CD of agentic-app-playground."

  depends_on = [google_project_service.wif]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.wif_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.wif_provider_id
  display_name                       = "GitHub provider"
  description                        = "OIDC provider for github.com, restricted to ${local.github_repo_full}."

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Hard repo restriction: only tokens from this repository are accepted.
  attribute_condition = "assertion.repository == \"${local.github_repo_full}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ---------------------------------------------------------------------------
# Per-env deployer service accounts (gh-deployer@<project>).
# Each lives in its own env project and gets least-priv project roles there.
# ---------------------------------------------------------------------------

resource "google_service_account" "deployer_dev" {
  provider = google.dev

  project      = var.dev_project_id
  account_id   = var.deployer_account_id
  display_name = "GitHub Actions deployer (dev)"
  description  = "CI/CD deployer for the dev env; impersonated via WIF, no JSON keys."

  depends_on = [google_project_service.dev]
}

resource "google_service_account" "deployer_prod" {
  provider = google.prod

  project      = var.prod_project_id
  account_id   = var.deployer_account_id
  display_name = "GitHub Actions deployer (prod)"
  description  = "CI/CD deployer for the prod env; impersonated via WIF, no JSON keys."

  depends_on = [google_project_service.prod]
}

# --- Least-priv project roles for each deployer SA --------------------------

resource "google_project_iam_member" "deployer_dev_roles" {
  provider = google.dev
  for_each = toset(var.deployer_roles)

  project = var.dev_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer_dev.email}"
}

resource "google_project_iam_member" "deployer_prod_roles" {
  provider = google.prod
  for_each = toset(var.deployer_roles)

  project = var.prod_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer_prod.email}"
}

# CD's single build-and-push job authenticates as the DEV deployer SA but pushes
# the built images to BOTH projects' registries (build once, promote same image).
# So the DEV deployer also needs writer on the PROD Artifact Registry.
resource "google_project_iam_member" "deployer_dev_push_to_prod_ar" {
  provider = google.prod
  project  = var.prod_project_id
  role     = "roles/artifactregistry.writer"
  member   = "serviceAccount:${google_service_account.deployer_dev.email}"
}

# ---------------------------------------------------------------------------
# Allow the GitHub repo's WIF identities to impersonate the deployer SAs.
#
# principalSet binds ALL identities from this repo (the pool already restricts
# to the repo via attribute_condition). Branch/Environment gating is enforced
# in the workflow + GitHub 'prod' Environment approval, not here, so that PR
# plan jobs can also authenticate. Tighten the principalSet to a specific
# attribute.ref if you want IAM-level branch restriction too.
# ---------------------------------------------------------------------------

locals {
  wif_principal_repo = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${local.github_repo_full}"
}

resource "google_service_account_iam_member" "deployer_dev_wif" {
  provider = google.dev

  service_account_id = google_service_account.deployer_dev.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.wif_principal_repo
}

resource "google_service_account_iam_member" "deployer_prod_wif" {
  provider = google.prod

  service_account_id = google_service_account.deployer_prod.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.wif_principal_repo
}
