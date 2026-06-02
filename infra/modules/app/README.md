# `app` Terraform module

Provisions **one environment** (dev *or* prod) of the agentic-app-playground
stack on GCP. Environment isolation is by **project** (`agentic-app-dev` /
`agentic-app-prod`) — the resource names (`agent`, `web`, `containers`, ...) are
identical in both. Instantiate this module once per environment from the env
layer, passing the per-env `project_id`, `image_tag` (git SHA), and any prod
safety toggles.

## What it creates

- **Artifact Registry** Docker repo `containers`
  (`us-central1-docker.pkg.dev/<project_id>/containers/<service>:<git_sha>`).
- **Cloud Run v2** services `agent` and `web`, each with its **own least-priv
  runtime service account** (not the default compute SA). **Terraform is the
  SOLE deploy path** — CD only builds/pushes images and runs
  `terraform apply -var image_tag=<git_sha>`; it never uses `deploy-cloudrun`.
- **Cloud SQL Postgres** instance + database + user — the durable LangGraph
  checkpointer backing `DATABASE_URI`.
- **Memorystore (Redis)** instance — the **mandatory** task-queue / pub-sub
  backend for the self-hosted LangGraph server, backing `REDIS_URI`.
- **VPC + subnet** used for Cloud Run **Direct VPC egress** so the agent can
  reach the private Memorystore IP (and the Memorystore authorized network).
- **Secret Manager**: a module-managed `agent-database-uri` secret plus any
  optional secrets (e.g. `LANGSMITH_API_KEY`); the agent runtime SA is granted
  `secretAccessor` on each.
- **IAM**: agent runtime SA gets `roles/aiplatform.user`,
  `roles/cloudsql.client`, and per-secret `secretmanager.secretAccessor`; the
  **web** runtime SA gets `roles/run.invoker` **on the agent service** (the BFF
  proxy mints an OIDC ID token to call the private agent).
- **Service enablement** for run, sqladmin, artifactregistry, secretmanager,
  iam(+iamcredentials), aiplatform, redis, compute, servicenetworking (toggle
  with `manage_project_services`).

## Serving model (self-hosted LangGraph Agent Server)

The agent image is built **from `langchain/langgraph-api`** (via `langgraph
build`/`dockerfile`); its baked entrypoint serves on **port 8000** and does
**not** read `$PORT`, so this module sets the agent container port to `8000`
explicitly (`agent_container_port`). The server owns the durable checkpointer:
`agent.py` exports a compiled graph **without** its own checkpointer, and the
server wires Postgres persistence from `DATABASE_URI`. Redis is **required** —
the standalone server cannot run Postgres-only.

## App env vars

| Service | Var | Source |
|---|---|---|
| agent | `GOOGLE_CLOUD_PROJECT` | plain env = `project_id` |
| agent | `GOOGLE_CLOUD_LOCATION` | plain env = `region` (`us-central1`) |
| agent | `DATABASE_URI` | Secret Manager (`agent-database-uri`), Cloud SQL Postgres |
| agent | `REDIS_URI` | plain env = `redis://<memorystore-host>:<port>` (private VPC) |
| agent | `LANGGRAPH_CLOUD_LICENSE_KEY` / `LANGSMITH_API_KEY` | **required for prod** — supply via `agent_optional_secrets` (Secret Manager) |
| agent | `LANGSMITH_TRACING` | optional — plain env |
| web | `AGENT_URL` | **runtime** env = the deployed (private) agent Cloud Run URL |
| web | `ASSISTANT_ID` | **runtime** env = `agent` |

### Same-origin BFF; the web image is env-agnostic

There is **no** `NEXT_PUBLIC_API_URL` build arg anymore. The browser calls only
the `web` service (same origin); a Next.js route handler proxies to the
**private** agent using the **runtime** env var `AGENT_URL` (injected by this
module from the agent service's `uri`) and a GCP-issued OIDC ID token (audience =
agent URL). Because nothing env-specific is baked into the image, the **same**
web image promotes dev->prod unchanged. The agent is private
(`agent_allow_unauthenticated = false`); the web runtime SA's `run.invoker`
binding on the agent authorizes the proxy's token.

## Promotion model

Build both images once in CI tagged with the immutable git SHA, deploy to **dev**
automatically, then **promote the same `image_tag`** to **prod** behind the
GitHub `prod` Environment approval. Never rebuild between envs — pass the same
`image_tag` to both module instances.

## Production prerequisites & decisions

- **LangSmith / LangGraph license (REQUIRED).** The self-hosted standalone
  Agent Server will **not start** in production without a license. Provide
  `LANGGRAPH_CLOUD_LICENSE_KEY` (or `LANGSMITH_API_KEY`) via `agent_optional_secrets`
  and populate the secret value out-of-band. The server also egresses to
  `beacon.langchain.com` for license verification unless you hold an air-gapped
  key — keep `agent_vpc_egress = PRIVATE_RANGES_ONLY` (default) so public egress
  stays direct, or open the route accordingly.
- **Durable persistence (wired).** Postgres (`DATABASE_URI`) and Redis
  (`REDIS_URI`) are both provisioned and wired. The server injects the
  Postgres-backed checkpointer itself — `agent.py` must stay checkpointer-free
  (do **not** add a `PostgresSaver`; that conflicts with the server-managed
  checkpointer).
- **VPC egress (wired).** The agent uses **Direct VPC egress** into a
  module-created VPC/subnet that is the Memorystore authorized network. Pick a
  non-overlapping `agent_egress_subnet_cidr` (default `10.8.0.0/24`) or bring
  your own network via `create_network = false` + `network_id` /
  `agent_egress_subnet_id`.
- **Cloud SQL networking.** Postgres stays on the built-in `/cloudsql` unix
  socket (independent of the VPC). For stricter isolation, switch to Private IP.

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `project_id` | string | — (required) | Env project (`agentic-app-dev`/`-prod`). |
| `region` | string | `us-central1` | Region for all regional resources. |
| `env` | string | `dev` | `dev`/`prod`; labels + replication intent only, no name suffix. |
| `labels` | map(string) | `{}` | Extra labels. |
| `artifact_registry_repo` | string | `containers` | AR Docker repo name. |
| `image_tag` | string | — (required) | Immutable git SHA tag for **both** services. |
| `agent_service_name` | string | `agent` | Agent Cloud Run service name. |
| `web_service_name` | string | `web` | Web Cloud Run service name. |
| `agent_image` | string | `null` | Override full agent image ref (else convention path). |
| `web_image` | string | `null` | Override full web image ref (else convention path). |
| `agent_min_instances` | number | `0` | **Prod toggle**: set ≥1 to keep a warm agent. |
| `agent_max_instances` | number | `4` | Agent max instances. |
| `web_min_instances` | number | `0` | Web min instances. |
| `web_max_instances` | number | `4` | Web max instances. |
| `agent_cpu` / `agent_memory` | string | `1` / `1Gi` | Agent container resources. |
| `web_cpu` / `web_memory` | string | `1` / `512Mi` | Web container resources. |
| `agent_allow_unauthenticated` | bool | `false` | Public invoke for agent. Keep **false** (private); web SA gets `run.invoker`. |
| `web_allow_unauthenticated` | bool | `true` | Public invoke for web. |
| `redis_instance_name` | string | `agentic-app-redis` | Memorystore Redis instance name. |
| `redis_tier` | string | `BASIC` | `BASIC` (dev) / `STANDARD_HA` (prod). |
| `redis_memory_size_gb` | number | `1` | Redis capacity (GB). |
| `redis_version` | string | `REDIS_7_2` | Redis engine version. |
| `create_network` | bool | `true` | Create the VPC/subnet for Direct VPC egress. |
| `network_name` | string | `agentic-app-vpc` | Name of the created VPC. |
| `network_id` | string | `null` | Existing VPC id when `create_network=false`. |
| `agent_egress_subnet_id` | string | `null` | Existing egress subnet id when `create_network=false`. |
| `agent_egress_subnet_cidr` | string | `10.8.0.0/24` | CIDR for the created egress subnet. |
| `agent_vpc_egress` | string | `PRIVATE_RANGES_ONLY` | `PRIVATE_RANGES_ONLY` / `ALL_TRAFFIC`. |
| `agent_container_port` | number | `8000` | Port the langgraph-api image serves on (ignores `$PORT`). |
| `agent_health_path` | string | `/ok` | Agent startup/liveness probe path. |
| `agent_startup_failure_threshold` | number | `30` | Startup-probe failures tolerated (cold DB/Redis/license). |
| `web_health_path` | string | `/` | Web startup probe path. |
| `sql_instance_name` | string | `agentic-app-pg` | Cloud SQL instance name. |
| `sql_database_name` | string | `langgraph` | Checkpointer database. |
| `sql_user_name` | string | `agent` | Postgres app user. |
| `sql_tier` | string | `db-f1-micro` | SQL machine tier (size up for prod). |
| `sql_postgres_version` | string | `POSTGRES_16` | Engine version. |
| `sql_availability_type` | string | `ZONAL` | `ZONAL`/`REGIONAL` (prod HA). |
| `sql_disk_size_gb` | number | `10` | Initial data disk. |
| `sql_deletion_protection` | bool | `true` | **Prod safety**: block instance deletion. |
| `sql_backup_enabled` | bool | `true` | Automated backups (PITR auto-on in prod). |
| `agent_optional_secrets` | map(object) | `{}` | env-var → `{secret_id, create}` optional secrets surfaced to agent. |
| `agent_plain_env` | map(string) | `{}` | Extra non-secret agent env vars. |
| `langsmith_tracing` | string | `null` | If set, `LANGSMITH_TRACING` plain env. |
| `web_assistant_id` | string | `agent` | **Runtime** `ASSISTANT_ID` for the web BFF. |
| `web_plain_env` | map(string) | `{}` | Extra **runtime** env vars for the web service. |
| `manage_project_services` | bool | `true` | Enable required GCP APIs in this project. |

## Outputs

| Name | Description |
|---|---|
| `project_id` | Project provisioned into. |
| `region` | Region used. |
| `artifact_registry_repo` | AR repo name. |
| `artifact_registry_path` | `<region>-docker.pkg.dev/<project_id>/<repo>` image base. |
| `agent_image` / `web_image` | Resolved image references deployed. |
| `agent_service_url` / `agent_url` | Agent Cloud Run URL (private) — wired into web's `AGENT_URL`. |
| `web_service_url` | Web Cloud Run URL (browser-facing). |
| `redis_host` / `redis_port` / `redis_uri` | Memorystore host/port and the wired `REDIS_URI`. |
| `network_id` / `agent_egress_subnet_id` | VPC + subnet used for Direct VPC egress. |
| `agent_service_name` / `web_service_name` | Service names (for CD deploys). |
| `agent_runtime_service_account` | Agent least-priv runtime SA email. |
| `web_runtime_service_account` | Web least-priv runtime SA email. |
| `sql_instance_name` | Cloud SQL instance name. |
| `sql_connection_name` | `project:region:instance` for the `/cloudsql` socket. |
| `sql_database_name` / `sql_user_name` | Checkpointer DB / user. |
| `database_uri_secret_id` | Secret id holding `DATABASE_URI`. |
| `database_uri` | Full `DATABASE_URI` (**sensitive** — embeds password). |
| `optional_secret_ids` | env-var → secret id for module-created optional secrets. |

## Example

```hcl
module "app" {
  source = "../../modules/app"

  project_id = "agentic-app-prod"
  region     = "us-central1"
  env        = "prod"
  image_tag  = var.git_sha # same SHA promoted from dev

  # prod safety
  agent_min_instances     = 1
  sql_availability_type   = "REGIONAL"
  sql_tier                = "db-custom-2-7680"
  sql_deletion_protection = true
  redis_tier              = "STANDARD_HA"

  # agent is private; web SA invokes it via the BFF + OIDC (default false)
  agent_allow_unauthenticated = false

  # REQUIRED in prod: the standalone server needs a license to start.
  agent_optional_secrets = {
    LANGGRAPH_CLOUD_LICENSE_KEY = { secret_id = "langgraph-cloud-license-key" }
    LANGSMITH_API_KEY           = { secret_id = "langsmith-api-key" }
  }
  langsmith_tracing = "true"
}
```

> **Note on the deployer SA / Workload Identity Federation.** The CI→GCP
> `gh-deployer@<project_id>` service account, the `github-pool` WIF pool, and the
> `github-provider` live in the **bootstrap/CI-auth** layer, not this app module.
> This module only defines the **runtime** service accounts.
