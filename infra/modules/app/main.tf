# =============================================================================
# main.tf — provisions ONE environment of the agentic-app stack.
#
# Resources:
#   * Required GCP API enablement
#   * Artifact Registry 'containers' Docker repo
#   * Cloud SQL Postgres instance + database + user (durable checkpointer)
#   * DATABASE_URI secret (built from the SQL user/password) in Secret Manager
#   * Optional secrets (LANGSMITH etc.) in Secret Manager
#   * Per-service least-priv runtime service accounts (NOT default compute SA)
#   * IAM: agent SA -> aiplatform.user + cloudsql.client + secret accessor
#   * Two Cloud Run v2 services: 'agent' and 'web'
# =============================================================================

locals {
  # Image references follow the convention path unless explicitly overridden.
  ar_host = "${var.region}-docker.pkg.dev"
  ar_path = "${local.ar_host}/${var.project_id}/${var.artifact_registry_repo}"

  agent_image = coalesce(
    var.agent_image,
    "${local.ar_path}/${var.agent_service_name}:${var.image_tag}",
  )
  web_image = coalesce(
    var.web_image,
    "${local.ar_path}/${var.web_service_name}:${var.image_tag}",
  )

  common_labels = merge(
    {
      app = "agentic-app"
      env = var.env
    },
    var.labels,
  )

  # APIs required by this stack.
  required_services = var.manage_project_services ? toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "aiplatform.googleapis.com",
    "compute.googleapis.com",           # VPC/subnet for Direct VPC egress + Cloud SQL networking
    "redis.googleapis.com",             # Memorystore for Redis (LangGraph task queue / pub-sub)
    "servicenetworking.googleapis.com", # private services access for Memorystore peering
    "storage.googleapis.com",           # GCS bucket for uploaded RFP PDFs
  ]) : toset([])

  # Name of the RFP-documents bucket (null when not created), surfaced to both
  # services as RFP_BUCKET. one(...) yields the single bucket name or null.
  rfp_bucket = one(google_storage_bucket.rfp[*].name)

  # Cloud SQL connection name used by the Cloud Run sidecar socket.
  sql_connection_name = google_sql_database_instance.pg.connection_name

  # DATABASE_URI for the durable LangGraph checkpointer. Cloud Run mounts the
  # Cloud SQL instance over a unix socket at /cloudsql/<connection_name>, so we
  # connect via that socket (host = the socket dir) — no public IP needed.
  database_uri = format(
    "postgresql://%s:%s@/%s?host=/cloudsql/%s",
    var.sql_user_name,
    google_sql_user.agent.password,
    var.sql_database_name,
    local.sql_connection_name,
  )

  # Network used for Cloud Run Direct VPC egress to private Memorystore. Either
  # the module-created VPC/subnet or operator-supplied ones.
  network_id       = var.create_network ? google_compute_network.vpc[0].id : var.network_id
  egress_subnet_id = var.create_network ? google_compute_subnetwork.agent_egress[0].id : var.agent_egress_subnet_id

  # REDIS_URI for the LangGraph server (researched env var name). Memorystore
  # Basic/Standard exposes a private host:port reachable over the peered VPC.
  # AUTH is disabled on the module's instance (private VPC only); if you enable
  # auth_enabled, switch to redis://:<auth_string>@host:port and source it from
  # Secret Manager instead of a plain env var.
  redis_uri = format(
    "redis://%s:%d",
    google_redis_instance.cache.host,
    google_redis_instance.cache.port,
  )
}

# ---------------------------------------------------------------------------
# Service enablement
# ---------------------------------------------------------------------------

resource "google_project_service" "services" {
  for_each = local.required_services

  project = var.project_id
  service = each.value

  # Keep APIs enabled if the module is destroyed; other workloads may rely on them.
  disable_on_destroy         = false
  disable_dependent_services = false
}

# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo
  description   = "Container images for the agentic-app (${var.env})."
  format        = "DOCKER"
  labels        = local.common_labels

  depends_on = [google_project_service.services]
}

# ---------------------------------------------------------------------------
# Runtime service accounts (one per Cloud Run service, least privilege).
# Explicitly NOT the default compute SA.
# ---------------------------------------------------------------------------

resource "google_service_account" "agent_runtime" {
  project      = var.project_id
  account_id   = "run-agent"
  display_name = "Cloud Run runtime SA — agent service"
}

resource "google_service_account" "web_runtime" {
  project      = var.project_id
  account_id   = "run-web"
  display_name = "Cloud Run runtime SA — web service"
}

# Agent runtime SA: Vertex AI + Cloud SQL client. (Secret accessor granted
# per-secret below.)
resource "google_project_iam_member" "agent_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent_runtime.email}"
}

resource "google_project_iam_member" "agent_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.agent_runtime.email}"
}

# ---------------------------------------------------------------------------
# Cloud SQL Postgres — durable checkpointer backing store (DATABASE_URI)
# ---------------------------------------------------------------------------
# The self-hosted LangGraph Agent Server owns the checkpointer/store and wires
# durable Postgres persistence from DATABASE_URI itself (agent.py stays
# checkpointer-free). Redis (the OTHER mandatory dependency) is provisioned in
# network.tf as a Memorystore instance and wired in via REDIS_URI below.

resource "random_password" "sql_agent" {
  length  = 32
  special = false # keep URI-safe; avoids escaping in DATABASE_URI
}

resource "google_sql_database_instance" "pg" {
  project          = var.project_id
  name             = var.sql_instance_name
  region           = var.region
  database_version = var.sql_postgres_version

  # PROD SAFETY: deletion_protection guards the API; the TF lifecycle flag below
  # guards Terraform itself. Both follow the same toggle.
  deletion_protection = var.sql_deletion_protection

  settings {
    tier = var.sql_tier
    # ENTERPRISE (not the ENTERPRISE_PLUS default) supports shared-core tiers
    # like db-f1-micro / db-g1-small and the db-custom-* tiers we use.
    edition           = "ENTERPRISE"
    availability_type = var.sql_availability_type
    disk_size         = var.sql_disk_size_gb
    disk_autoresize   = true
    user_labels       = local.common_labels

    backup_configuration {
      enabled = var.sql_backup_enabled
      # Point-in-time recovery is useful in prod; WAL retention costs storage.
      point_in_time_recovery_enabled = var.env == "prod"
    }

    ip_configuration {
      # Cloud Run connects via the built-in unix socket (/cloudsql/...), so the
      # public IP is not exposed to the internet by authorized networks here.
      # TODO(decision): for stricter isolation switch to Private IP + Serverless
      # VPC Access connector and set ipv4_enabled=false. Tracked in decisions.
      ipv4_enabled = true
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_sql_database" "langgraph" {
  project  = var.project_id
  name     = var.sql_database_name
  instance = google_sql_database_instance.pg.name
}

resource "google_sql_user" "agent" {
  project  = var.project_id
  name     = var.sql_user_name
  instance = google_sql_database_instance.pg.name
  password = random_password.sql_agent.result
}

# ---------------------------------------------------------------------------
# Secret Manager
# ---------------------------------------------------------------------------

# DATABASE_URI — managed by this module, fed to the agent as a secret env var.
resource "google_secret_manager_secret" "database_uri" {
  project   = var.project_id
  secret_id = "agent-database-uri"
  labels    = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_uri" {
  secret      = google_secret_manager_secret.database_uri.id
  secret_data = local.database_uri
}

resource "google_secret_manager_secret_iam_member" "agent_database_uri_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_uri.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.agent_runtime.email}"
}

# Optional secrets (LANGSMITH_API_KEY, etc.). Created when create=true; the
# real value is populated out-of-band (CI / console) unless a placeholder_value
# seeds an initial version below.
resource "google_secret_manager_secret" "optional" {
  for_each = {
    for env_name, cfg in var.agent_optional_secrets : env_name => cfg
    if cfg.create
  }

  project   = var.project_id
  secret_id = each.value.secret_id
  labels    = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

# Optional placeholder version. Only for module-created secrets that set
# placeholder_value. This makes the Cloud Run secret env var's "latest"
# reference resolvable at first deploy (a version-less secret would fail the
# revision). The real value is added later as a NEW version out-of-band, and
# "latest" then points at it. We ignore secret_data changes so re-applying never
# clobbers a real value that was layered on top.
resource "google_secret_manager_secret_version" "optional_placeholder" {
  for_each = {
    for env_name, cfg in var.agent_optional_secrets : env_name => cfg
    if cfg.create && cfg.placeholder_value != null
  }

  secret      = google_secret_manager_secret.optional[each.key].id
  secret_data = each.value.placeholder_value

  lifecycle {
    ignore_changes = [secret_data, enabled]
  }
}

# Grant the agent runtime SA accessor on every optional secret (created or
# pre-existing).
resource "google_secret_manager_secret_iam_member" "agent_optional_accessor" {
  for_each = var.agent_optional_secrets

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.agent_runtime.email}"

  depends_on = [google_secret_manager_secret.optional]
}

# ---------------------------------------------------------------------------
# GCS bucket — uploaded RFP PDFs (and, in Phase 2, the capability corpus)
# ---------------------------------------------------------------------------
# The web service uploads RFP PDFs here (objectCreator) and hands the agent a
# gs:// pointer; the agent downloads and parses them (objectViewer). Follows the
# tfstate-bucket conventions in bootstrap/: uniform access, public access
# prevented, versioned. force_destroy stays false so a stray destroy can't wipe
# uploaded documents.

resource "google_storage_bucket" "rfp" {
  count = var.create_rfp_bucket ? 1 : 0

  project                     = var.project_id
  name                        = "${var.project_id}-${var.rfp_bucket_name}"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  labels = merge(local.common_labels, { purpose = "rfp-documents" })

  depends_on = [google_project_service.services]
}

# Agent runtime SA reads uploaded PDFs.
resource "google_storage_bucket_iam_member" "agent_rfp_viewer" {
  count = var.create_rfp_bucket ? 1 : 0

  bucket = google_storage_bucket.rfp[0].name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.agent_runtime.email}"
}

# Web runtime SA uploads PDFs (the BFF upload route).
resource "google_storage_bucket_iam_member" "web_rfp_creator" {
  count = var.create_rfp_bucket ? 1 : 0

  bucket = google_storage_bucket.rfp[0].name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.web_runtime.email}"
}

# ---------------------------------------------------------------------------
# Cloud Run v2 — agent service (self-hosted LangGraph Agent Server)
# ---------------------------------------------------------------------------
# The image is built FROM langchain/langgraph-api; its baked entrypoint serves
# on port 8000 and does NOT read $PORT, so the container port is set explicitly
# to var.agent_container_port (8000). The server owns the durable Postgres
# checkpointer (DATABASE_URI) and uses Redis (REDIS_URI) for pub/sub + the
# background-run task queue. Direct VPC egress gives it a route to private
# Memorystore. Env vars: GOOGLE_CLOUD_PROJECT/LOCATION, DATABASE_URI, REDIS_URI,
# and a LangSmith license var (see agent_optional_secrets / decisions_needed).

resource "google_cloud_run_v2_service" "agent" {
  project  = var.project_id
  name     = var.agent_service_name
  location = var.region
  labels   = local.common_labels

  # Cloud Run services are stateless (durable data is in Cloud SQL/Redis), so
  # allow Terraform to replace them freely. The provider defaults this to true,
  # which blocks redeploys that require replacement.
  deletion_protection = false

  # PRIVATE agent (D3): no public ingress path needed because only the web
  # runtime SA invokes it (granted run.invoker below) with an OIDC ID token.
  # INTERNAL_LOAD_BALANCER would also block direct internet hits, but ALL keeps
  # the IAM check as the single gate and avoids requiring the web service on the
  # same VPC. allow_unauthenticated is false by default, so unauthenticated
  # callers are rejected regardless of ingress.
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.agent_runtime.email

    scaling {
      min_instance_count = var.agent_min_instances
      max_instance_count = var.agent_max_instances
    }

    # Direct VPC egress: attach to the VPC/subnet that is peered with (and the
    # authorized network of) the Memorystore instance, so the private Redis IP
    # is routable. PRIVATE_RANGES_ONLY keeps public egress (Vertex AI, the
    # LangSmith license beacon) off the VPC by default.
    vpc_access {
      network_interfaces {
        network    = local.network_id
        subnetwork = local.egress_subnet_id
      }
      egress = var.agent_vpc_egress
    }

    # Mount the Cloud SQL instance so DATABASE_URI's unix socket exists.
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [local.sql_connection_name]
      }
    }

    containers {
      image = local.agent_image

      # The langgraph-api entrypoint binds 8000 and ignores $PORT; tell Cloud
      # Run which port to send requests to.
      ports {
        container_port = var.agent_container_port
      }

      resources {
        limits = {
          cpu    = var.agent_cpu
          memory = var.agent_memory
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # Startup probe: generous threshold because first boot connects to Cloud
      # SQL + Redis and validates the LangSmith license (slow cold start).
      startup_probe {
        http_get {
          path = var.agent_health_path
          port = var.agent_container_port
        }
        initial_delay_seconds = 10
        period_seconds        = 10
        timeout_seconds       = 5
        failure_threshold     = var.agent_startup_failure_threshold
      }

      # Liveness probe: restart the container if the server stops answering.
      liveness_probe {
        http_get {
          path = var.agent_health_path
          port = var.agent_container_port
        }
        initial_delay_seconds = 30
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      # --- Convention-mandated env vars ---
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }

      # DATABASE_URI from Secret Manager (durable Postgres checkpointer; the
      # server injects persistence from this — agent.py stays checkpointer-free).
      env {
        name = "DATABASE_URI"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_uri.secret_id
            version = "latest"
          }
        }
      }

      # REDIS_URI — private Memorystore over the VPC (mandatory for the server).
      env {
        name  = "REDIS_URI"
        value = local.redis_uri
      }

      # RFP_BUCKET — GCS bucket the agent reads uploaded PDFs from (ingest_rfp).
      dynamic "env" {
        for_each = local.rfp_bucket == null ? {} : { RFP_BUCKET = local.rfp_bucket }
        content {
          name  = env.key
          value = env.value
        }
      }

      # Optional LangSmith tracing flag (plain env).
      dynamic "env" {
        for_each = var.langsmith_tracing == null ? {} : { LANGSMITH_TRACING = var.langsmith_tracing }
        content {
          name  = env.key
          value = env.value
        }
      }

      # Additional plain env vars.
      dynamic "env" {
        for_each = var.agent_plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      # Optional secret env vars (LANGSMITH_API_KEY, etc.).
      dynamic "env" {
        for_each = var.agent_optional_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_iam_member.agent_database_uri_accessor,
    google_secret_manager_secret_iam_member.agent_optional_accessor,
    google_project_iam_member.agent_cloudsql_client,
    google_redis_instance.cache,
  ]
}

# ---------------------------------------------------------------------------
# Cloud Run v2 — web service (Next.js standalone server, same-origin BFF)
# ---------------------------------------------------------------------------
# The web image is ENV-AGNOSTIC (no NEXT_PUBLIC_API_URL baked in), so the SAME
# image promotes dev->prod. The browser calls only this service; a Next.js route
# handler proxies to the PRIVATE agent using the RUNTIME env var AGENT_URL
# (injected here from the agent service's uri) plus a GCP OIDC ID token. The web
# runtime SA is granted run.invoker on the agent below.

resource "google_cloud_run_v2_service" "web" {
  project  = var.project_id
  name     = var.web_service_name
  location = var.region
  labels   = local.common_labels

  # Stateless service — let Terraform replace it freely (provider default true).
  deletion_protection = false

  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.web_runtime.email

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      image = local.web_image

      resources {
        limits = {
          cpu    = var.web_cpu
          memory = var.web_memory
        }
      }

      # Next.js standalone listens on $PORT (8080). Startup probe on the app root.
      startup_probe {
        http_get {
          path = var.web_health_path
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 10
      }

      # RUNTIME (server-side) env: the agent's internal Cloud Run URL the BFF
      # route handler proxies to. NOT a NEXT_PUBLIC_* build arg.
      env {
        name  = "AGENT_URL"
        value = google_cloud_run_v2_service.agent.uri
      }

      # The LangGraph graph/assistant id the BFF targets (runtime, not baked).
      env {
        name  = "ASSISTANT_ID"
        value = var.web_assistant_id
      }

      # RFP_BUCKET — GCS bucket the upload route streams PDFs into.
      dynamic "env" {
        for_each = local.rfp_bucket == null ? {} : { RFP_BUCKET = local.rfp_bucket }
        content {
          name  = env.key
          value = env.value
        }
      }

      # Additional plain runtime env vars.
      dynamic "env" {
        for_each = var.web_plain_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  depends_on = [google_project_service.services]
}

# ---------------------------------------------------------------------------
# Public invocation bindings (toggle per service)
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service_iam_member" "agent_public" {
  count = var.agent_allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.agent.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  count = var.web_allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# Service-to-service: WEB runtime SA may invoke the PRIVATE agent (D3).
# The BFF route handler mints a GCP OIDC ID token (audience = agent URL); this
# binding authorizes that token. Always present, independent of the public
# toggle, so the same-origin proxy works whether or not the agent is public.
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service_iam_member" "web_invokes_agent" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.agent.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.web_runtime.email}"
}
