# =============================================================================
# main.tf (dev) — instantiates the reusable app module for the DEV environment.
#
# Env separation is by PROJECT (agentic-app-dev). Resource names ('agent',
# 'web', 'containers', ...) are identical to prod and intentionally NOT suffixed.
# Dev is the auto-deploy target on merge to main; prod promotes the SAME image
# behind a manual approval.
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
  env        = "dev"

  # --- Images (immutable git SHA from CI) ---
  image_tag   = var.image_tag
  agent_image = var.agent_image
  web_image   = var.web_image

  # --- Dev sizing: scale to zero, single-instance, cheapest SQL tier ---
  agent_min_instances = 0
  agent_max_instances = 2
  web_min_instances   = 0
  web_max_instances   = 2

  # --- Cloud SQL: dev is disposable; allow easy teardown, no HA ---
  sql_tier                = "db-f1-micro"
  sql_availability_type   = "ZONAL"
  sql_deletion_protection = false
  sql_backup_enabled      = false

  # --- Memorystore (Redis): smallest Basic tier for dev ---
  redis_tier           = "BASIC"
  redis_memory_size_gb = 1

  # --- Public invoke: web is browser-facing; agent stays PRIVATE (only the web
  #     runtime SA invokes it via the same-origin BFF + OIDC token). ---
  agent_allow_unauthenticated = false
  web_allow_unauthenticated   = true

  # --- Self-hosted server auth (Self-Hosted Lite via LangSmith) ---
  # The standalone langchain/langgraph-api server validates at startup against
  # LangSmith using this API key. The 'langsmith-api-key' secret + its version
  # were created out-of-band (gcloud); the module grants the agent runtime SA
  # accessor and injects it as the LANGSMITH_API_KEY env var.
  agent_optional_secrets = {
    LANGSMITH_API_KEY = { secret_id = "langsmith-api-key", create = false }
  }

  # --- Optional LangSmith tracing (secret value populated out-of-band) ---
  langsmith_tracing = var.langsmith_tracing

  # --- Web runtime config: AGENT_URL is wired automatically by the module. ---
  web_assistant_id = "agent"

  labels = {
    managed-by = "terraform"
    layer      = "env-dev"
  }
}
