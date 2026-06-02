# =============================================================================
# Reusable "app" module — provisions ONE environment (dev OR prod) of the
# agentic-app-playground stack on GCP. All GCP-specific literals from the
# shared conventions are centralized here as variables with sensible defaults.
# Env separation is by PROJECT (agentic-app-dev / agentic-app-prod), not by
# resource-name suffix — service names ('agent', 'web') are identical in both.
# =============================================================================

# ---------------------------------------------------------------------------
# Core placement
# ---------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID for this environment (e.g. agentic-app-dev or agentic-app-prod)."
  type        = string
}

variable "region" {
  description = "GCP region for all regional resources (Artifact Registry, Cloud Run, Cloud SQL)."
  type        = string
  default     = "us-central1"
}

variable "env" {
  description = "Environment short name; used only for labels/secret-replication intent. Does NOT suffix resource names."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be one of: dev, prod."
  }
}

variable "labels" {
  description = "Common labels applied to resources that support labels."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------

variable "artifact_registry_repo" {
  description = "Name of the Docker repo in Artifact Registry. Convention: 'containers'."
  type        = string
  default     = "containers"
}

# ---------------------------------------------------------------------------
# Container images
# ---------------------------------------------------------------------------
# Image path convention:
#   <region>-docker.pkg.dev/<project_id>/<repo>/<service>:<git_sha>
# CD passes the immutable git SHA so the SAME image promotes dev -> prod.

variable "image_tag" {
  description = "Immutable image tag to deploy for BOTH services (the git SHA from CI). Same tag promotes from dev to prod — never rebuilt between envs."
  type        = string
}

variable "agent_service_name" {
  description = "Cloud Run service name for the Python LangGraph agent."
  type        = string
  default     = "agent"
}

variable "web_service_name" {
  description = "Cloud Run service name for the Next.js web UI."
  type        = string
  default     = "web"
}

variable "agent_image" {
  description = "Full agent image reference. Defaults to the convention path built from project/region/repo/service/tag. Override to point at a shared registry."
  type        = string
  default     = null
}

variable "web_image" {
  description = "Full web image reference. Defaults to the convention path built from project/region/repo/service/tag. Override to point at a shared registry."
  type        = string
  default     = null
}

# ---------------------------------------------------------------------------
# Cloud Run runtime tuning (prod-relevant safety toggles)
# ---------------------------------------------------------------------------

variable "agent_min_instances" {
  description = "Minimum Cloud Run instances for the agent. Set >=1 in prod to keep a warm instance and the Cloud SQL connection alive."
  type        = number
  default     = 0
}

variable "agent_max_instances" {
  description = "Maximum Cloud Run instances for the agent."
  type        = number
  default     = 4
}

variable "web_min_instances" {
  description = "Minimum Cloud Run instances for the web UI."
  type        = number
  default     = 0
}

variable "web_max_instances" {
  description = "Maximum Cloud Run instances for the web UI."
  type        = number
  default     = 4
}

variable "agent_cpu" {
  description = "CPU allocation for the agent service container."
  type        = string
  default     = "1"
}

variable "agent_memory" {
  description = "Memory allocation for the agent service container."
  type        = string
  default     = "1Gi"
}

variable "web_cpu" {
  description = "CPU allocation for the web service container."
  type        = string
  default     = "1"
}

variable "web_memory" {
  description = "Memory allocation for the web service container."
  type        = string
  default     = "512Mi"
}

variable "agent_allow_unauthenticated" {
  description = "Allow public (unauthenticated) invocation of the agent service. DEFAULT false: the agent is PRIVATE and only the web runtime SA (granted roles/run.invoker below) may call it, attaching a GCP OIDC ID token. Keep false in prod."
  type        = bool
  default     = false
}

variable "web_allow_unauthenticated" {
  description = "Allow public (unauthenticated) invocation of the web UI (browser-facing)."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# Cloud SQL (Postgres) — durable LangGraph checkpointer (DATABASE_URI)
# ---------------------------------------------------------------------------
# The in-memory checkpointer in agent/agent.py is NOT production-safe. Durable
# persistence via Cloud SQL Postgres is a prod prerequisite. See README +
# decisions_needed for the Redis/Memorystore and LangGraph Platform notes.

variable "sql_instance_name" {
  description = "Cloud SQL Postgres instance name (per environment/project)."
  type        = string
  default     = "agentic-app-pg"
}

variable "sql_database_name" {
  description = "Postgres database name used by the LangGraph checkpointer."
  type        = string
  default     = "langgraph"
}

variable "sql_user_name" {
  description = "Postgres application user for the agent runtime."
  type        = string
  default     = "agent"
}

variable "sql_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is fine for dev; size up for prod."
  type        = string
  default     = "db-f1-micro"
}

variable "sql_postgres_version" {
  description = "Cloud SQL Postgres engine version."
  type        = string
  default     = "POSTGRES_16"
}

variable "sql_availability_type" {
  description = "Cloud SQL availability: ZONAL (dev) or REGIONAL (prod HA)."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.sql_availability_type)
    error_message = "sql_availability_type must be ZONAL or REGIONAL."
  }
}

variable "sql_disk_size_gb" {
  description = "Initial Cloud SQL data disk size in GB."
  type        = number
  default     = 10
}

variable "sql_deletion_protection" {
  description = "PROD SAFETY TOGGLE: prevent accidental deletion of the Cloud SQL instance. Keep true in prod."
  type        = bool
  default     = true
}

variable "sql_backup_enabled" {
  description = "Enable automated Cloud SQL backups. Keep true in prod."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# Memorystore (Redis) — REQUIRED by the self-hosted LangGraph Agent Server
# ---------------------------------------------------------------------------
# The standalone LangGraph server uses Redis for pub/sub + the background-run
# task queue and CANNOT run Postgres-only. The agent reaches Redis over the VPC
# (private IP, no public endpoint) via Direct VPC egress — see the network vars.
# Wired into the agent as REDIS_URI (researched env var name).

variable "redis_instance_name" {
  description = "Memorystore for Redis instance name (per environment/project)."
  type        = string
  default     = "agentic-app-redis"
}

variable "redis_tier" {
  description = "Memorystore tier: BASIC (no HA, dev) or STANDARD_HA (replica + automatic failover, prod)."
  type        = string
  default     = "BASIC"

  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.redis_tier)
    error_message = "redis_tier must be BASIC or STANDARD_HA."
  }
}

variable "redis_memory_size_gb" {
  description = "Memorystore Redis capacity in GB."
  type        = number
  default     = 1
}

variable "redis_version" {
  description = "Memorystore Redis engine version."
  type        = string
  default     = "REDIS_7_2"
}

# ---------------------------------------------------------------------------
# VPC / network — lets Cloud Run reach private Memorystore Redis
# ---------------------------------------------------------------------------
# Direct VPC egress (recommended, no connector to manage): the agent Cloud Run
# service attaches to a subnet of this VPC, and that VPC is the authorized
# network of the Memorystore instance (Redis Basic/Standard uses VPC peering).
# The module creates a dedicated VPC + subnet by default; point at an existing
# network instead via the *_self_link / *_id overrides.

variable "network_name" {
  description = "Name of the VPC the module creates for Cloud Run<->Memorystore connectivity (when create_network=true)."
  type        = string
  default     = "agentic-app-vpc"
}

variable "create_network" {
  description = "If true, the module creates the VPC + subnet used for Direct VPC egress and as the Memorystore authorized network. Set false to bring your own network (then set network_id + agent_egress_subnet_id)."
  type        = bool
  default     = true
}

variable "network_id" {
  description = "Existing VPC self_link/id to use when create_network=false (also the Memorystore authorized network). Ignored when create_network=true."
  type        = string
  default     = null
}

variable "agent_egress_subnet_id" {
  description = "Existing subnet self_link/id for the agent's Direct VPC egress when create_network=false. Must live in var.region and in network_id. Ignored when create_network=true."
  type        = string
  default     = null
}

variable "agent_egress_subnet_cidr" {
  description = "Primary IPv4 CIDR for the module-created egress subnet (when create_network=true). Direct VPC egress allocates instance IPs from here; size for max instances. TODO(operator): ensure this does not overlap other ranges in the VPC."
  type        = string
  default     = "10.8.0.0/24"
}

variable "agent_vpc_egress" {
  description = "Cloud Run egress setting: PRIVATE_RANGES_ONLY routes only RFC1918 traffic through the VPC (Redis) and keeps public egress (e.g. Vertex AI, beacon.langchain.com) direct; ALL_TRAFFIC routes everything through the VPC."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"

  validation {
    condition     = contains(["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], var.agent_vpc_egress)
    error_message = "agent_vpc_egress must be PRIVATE_RANGES_ONLY or ALL_TRAFFIC."
  }
}

# ---------------------------------------------------------------------------
# Container ports + health probes
# ---------------------------------------------------------------------------
# The langgraph-built image (FROM langchain/langgraph-api) serves on 8000 and
# its baked entrypoint does NOT honor $PORT, so Cloud Run's container port for
# the agent is set explicitly to 8000. The web (Next.js standalone) listens on
# $PORT (8080) as usual.

variable "agent_container_port" {
  description = "Container port the LangGraph Agent Server listens on. The langchain/langgraph-api image serves on 8000 and does not read $PORT."
  type        = number
  default     = 8000
}

variable "agent_health_path" {
  description = "HTTP path for the agent's startup/liveness probes. The LangGraph Agent Server exposes /ok."
  type        = string
  default     = "/ok"
}

variable "agent_startup_failure_threshold" {
  description = "Startup-probe failure threshold for the agent. Generous, because the first boot connects to Cloud SQL + Redis and validates the LangSmith license (cold start can be slow)."
  type        = number
  default     = 30
}

variable "web_health_path" {
  description = "HTTP path for the web service's startup probe. Next.js serves the app root at /."
  type        = string
  default     = "/"
}

# ---------------------------------------------------------------------------
# Secret Manager — optional LangSmith / API keys
# ---------------------------------------------------------------------------
# DATABASE_URI is created and managed by THIS module (built from the Cloud SQL
# user/password) and exposed to the agent via Secret Manager. The map below is
# for ADDITIONAL optional secrets (e.g. LANGSMITH_API_KEY). Values are intended
# to be populated out-of-band (CI / console), so this map controls which secret
# *containers* exist and which the agent gets accessor on — not the values.

variable "agent_optional_secrets" {
  description = <<-EOT
    Optional secrets surfaced to the AGENT service as env vars.
    Key   = env var name exposed to the container (e.g. LANGSMITH_API_KEY).
    Value = object describing the secret. If create=true, the module creates a
            Secret Manager secret with this id and grants the agent runtime SA
            accessor. If create=false, the secret_id is assumed to already exist
            and the module only grants accessor + wires the env var.

            placeholder_value (create=true only): if set, the module seeds an
            initial secret version with this value so the Cloud Run env var's
            'latest' reference resolves and the service can deploy before the
            real value exists. Use a blank/whitespace placeholder for keys the
            app treats as "unconfigured" until populated out-of-band (the real
            value is added as a NEW version later; 'latest' then picks it up).
            Leave unset to create an empty secret you MUST populate before the
            service can reference it.
  EOT
  type = map(object({
    secret_id         = string
    create            = optional(bool, true)
    placeholder_value = optional(string)
  }))
  default = {
    # LANGSMITH_API_KEY = { secret_id = "langsmith-api-key" }
  }
}

variable "agent_plain_env" {
  description = "Additional non-secret env vars for the agent service (merged with the convention-mandated ones)."
  type        = map(string)
  default     = {}
}

variable "langsmith_tracing" {
  description = "If set, exposes LANGSMITH_TRACING to the agent as a plain env var (e.g. 'true'). Pair with a LANGSMITH_API_KEY secret in agent_optional_secrets."
  type        = string
  default     = null
}

# ---------------------------------------------------------------------------
# Web runtime config (same-origin BFF)
# ---------------------------------------------------------------------------
# The web image is now ENV-AGNOSTIC: there is NO build-time NEXT_PUBLIC_API_URL.
# The browser talks ONLY to the web service (same origin); a Next.js route
# handler proxies to the PRIVATE agent. The agent's Cloud Run URL is injected at
# RUNTIME as the server-side env var AGENT_URL (wired automatically from the
# agent service's uri — see main.tf). The assistant id stays a runtime env too.

variable "web_assistant_id" {
  description = "Runtime ASSISTANT_ID env var for the web BFF (the LangGraph graph name to target). Convention value is 'agent'."
  type        = string
  default     = "agent"
}

variable "web_plain_env" {
  description = "Additional non-secret runtime env vars for the web service (merged with the module-wired AGENT_URL / ASSISTANT_ID)."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Service enablement
# ---------------------------------------------------------------------------

variable "manage_project_services" {
  description = "If true, enable the required GCP APIs in this project. Disable if APIs are managed elsewhere (e.g. a bootstrap module)."
  type        = bool
  default     = true
}
