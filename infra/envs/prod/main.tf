# =============================================================================
# main.tf (prod) — instantiates the reusable app module for the PROD environment.
#
# Env separation is by PROJECT (agentic-app-prod). Resource names match dev
# exactly. Prod deploys the SAME image promoted from dev (same git SHA) behind
# a manual approval; it differs from dev only in SAFETY/SIZING toggles below
# (deletion protection, backups, HA, warm min instances).
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.40.0, < 7.0.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 5.40.0, < 7.0.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

module "app" {
  source = "../../modules/app"

  # --- Placement ---
  project_id = var.project_id
  region     = var.region
  env        = "prod"

  # --- Images (SAME git SHA promoted from dev — never rebuilt) ---
  image_tag   = var.image_tag
  agent_image = var.agent_image
  web_image   = var.web_image

  # --- Prod sizing: keep one warm agent instance so the Cloud SQL connection
  #     and any model clients stay alive; allow more headroom for traffic. ---
  agent_min_instances = 1
  agent_max_instances = 8
  web_min_instances    = 1
  web_max_instances    = 8

  agent_cpu    = "2"
  agent_memory = "2Gi"
  web_cpu      = "1"
  web_memory   = "512Mi"

  # --- Cloud SQL: PROD SAFETY — HA, backups, and deletion protection ON. ---
  sql_tier                = "db-custom-1-3840"
  sql_availability_type   = "REGIONAL"
  sql_deletion_protection = true
  sql_backup_enabled      = true
  sql_disk_size_gb        = 20

  # --- Memorystore (Redis): HA tier with replica + automatic failover. ---
  redis_tier           = "STANDARD_HA"
  redis_memory_size_gb = 2

  # --- Public invoke: web is browser-facing. Agent is PRIVATE; only the web
  #     runtime SA invokes it via the same-origin BFF + OIDC token. ---
  agent_allow_unauthenticated = false
  web_allow_unauthenticated   = true

  # --- Self-hosted LangGraph server LICENSE (REQUIRED to boot) ---
  # The standalone langchain/langgraph-api server validates a LangGraph Platform
  # license at startup and will NOT start without it. The module creates an empty
  # Secret Manager secret + grants the agent runtime SA accessor; populate the
  # version out-of-band before the first deploy (see docs/first-deploy-checklist.md).
  # Use LANGSMITH_API_KEY instead if validating against LangSmith SaaS.
  agent_optional_secrets = {
    LANGGRAPH_CLOUD_LICENSE_KEY = { secret_id = "langgraph-cloud-license-key", create = true }
  }

  # --- Optional LangSmith tracing (secret value populated out-of-band) ---
  langsmith_tracing = var.langsmith_tracing

  # --- Web runtime config: AGENT_URL is wired automatically by the module. ---
  web_assistant_id = "agent"

  labels = {
    managed-by = "terraform"
    layer      = "env-prod"
  }
}
