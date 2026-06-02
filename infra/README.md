# Infrastructure (`infra/`)

Terraform for the **agentic-app-playground** stack on GCP. Two deployables
(`agent` Python LangGraph server, `web` Next.js UI) run as **Cloud Run v2**
services, backed by **Cloud SQL Postgres** (durable LangGraph checkpointer) and
**Secret Manager**. CI/CD authenticates via **Workload Identity Federation**
(no JSON keys) and promotes a single immutable image from dev to prod.

## Layout

```
infra/
  modules/app/      # reusable module: ONE env (Cloud Run x2, SQL, secrets, SAs, AR)
  bootstrap/        # ONE-TIME: WIF pool/provider, deployer SAs, tfstate buckets
  envs/
    dev/            # calls modules/app for project agentic-app-dev  (auto-deploy)
    prod/           # calls modules/app for project agentic-app-prod (promotion)
```

Environment isolation is by **GCP project**, not by resource-name suffix —
service names (`agent`, `web`, `containers`, the SQL instance) are identical in
both `agentic-app-dev` and `agentic-app-prod`. Region is `us-central1`.

## State model

- **Remote state in GCS**, one bucket per env (created by `bootstrap`):
  - dev  -> `agentic-app-tfstate-dev`  (prefix `env/dev`)
  - prod -> `agentic-app-tfstate-prod` (prefix `env/prod`)
- **`bootstrap` starts on LOCAL state** because it creates those very buckets
  (chicken-and-egg). See `infra/bootstrap/README.md`.

## Apply order

```
1. bootstrap     (once, by an admin, local state)
2. envs/dev      (auto on merge to main)
3. envs/prod     (promotion of the SAME image, behind GitHub 'prod' approval)
```

### 1. Bootstrap (one time)

```bash
gcloud auth application-default login   # human with admin on both projects
cd infra/bootstrap
terraform init
terraform apply -var github_owner=<your-gh-org>
```

Record the outputs (`workload_identity_provider`, `deployer_service_account_dev`,
`deployer_service_account_prod`) for the CD workflow. Details in
`infra/bootstrap/README.md`.

### 2. Dev (auto-deploy on merge to main)

```bash
cd infra/envs/dev
terraform init                          # adopts the GCS backend
terraform plan  -var image_tag=<git_sha>
terraform apply -var image_tag=<git_sha>
```

`image_tag` is the **immutable git SHA** built once by CI. Everything else is in
`terraform.tfvars` / module defaults. For a quick local plan use any tag, e.g.
`-var image_tag=local-dev`.

### 3. Prod (promotion behind manual approval)

```bash
cd infra/envs/prod
terraform init
terraform plan  -var image_tag=<same_git_sha_validated_in_dev>
terraform apply -var image_tag=<same_git_sha_validated_in_dev>
```

**Promote, never rebuild.** Prod deploys the SAME `image_tag` already validated
in dev, gated by the GitHub `prod` Environment protection rule. Prod differs
from dev only in safety/sizing toggles set in `infra/envs/prod/main.tf`:
HA + backups + deletion protection on Cloud SQL, a warm `min_instances = 1`,
and larger CPU/memory.

## Promotion model (trunk-based)

On merge to `main`, CI builds BOTH images **once**, tags them with the git SHA,
pushes to Artifact Registry, and auto-deploys dev. The same SHA is then promoted
to prod behind a manual approval. The build is never repeated between envs.

## App env vars (per shared conventions)

| Service | Var | Where set |
|---|---|---|
| agent | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=us-central1` | Cloud Run runtime env (module) |
| agent | `DATABASE_URI` | Secret Manager -> Cloud Run (module-managed) |
| agent | `REDIS_URI` | Cloud Run runtime env (module, from Memorystore) |
| agent | `LANGGRAPH_CLOUD_LICENSE_KEY` / `LANGSMITH_API_KEY` | **required for prod**, Secret Manager (out-of-band value) |
| agent | `LANGSMITH_TRACING` | optional, plain env |
| web | `AGENT_URL` (= deployed private agent URL) | **runtime** Cloud Run env (module) |
| web | `ASSISTANT_ID=agent` | **runtime** Cloud Run env (module) |

The web image is **env-agnostic** — there is no `NEXT_PUBLIC_API_URL` build arg.
The browser hits only the web service (same origin); a Next.js BFF route handler
proxies to the **private** agent using the runtime `AGENT_URL` and a GCP OIDC ID
token. The same web image promotes dev->prod unchanged.

## Deploy model (Terraform owns Cloud Run)

Cloud Run is managed **only** by Terraform. CD builds + pushes both images
tagged with the git SHA, then runs `terraform apply -var image_tag=<sha>`
against dev (auto) and prod (behind the `prod` Environment approval). CD does
**not** use the `deploy-cloudrun` action. All runtime env/secrets/SA/probes live
in Terraform — one source of truth.

## Known architectural nuance / decisions

- **Redis (Memorystore):** provisioned by the module and wired as `REDIS_URI`;
  the self-hosted LangGraph server requires it. Cloud Run reaches the private
  Redis IP via **Direct VPC egress** into a module-created VPC/subnet (also the
  Memorystore authorized network). Choose a non-overlapping
  `agent_egress_subnet_cidr` (default `10.8.0.0/24`).
- **LangGraph license:** the standalone server will not start in prod without
  `LANGGRAPH_CLOUD_LICENSE_KEY` (or `LANGSMITH_API_KEY`). Add it via
  `agent_optional_secrets` and populate the value out-of-band.
- **Cloud SQL networking:** the instance is reached via Cloud Run's built-in
  `/cloudsql` unix socket (public IP, no authorized networks). Decide whether
  prod should move to **private IP**.
- **Private agent:** `agent_allow_unauthenticated = false`; the web runtime SA
  holds `run.invoker` on the agent so the BFF proxy's OIDC token is accepted.
- **Deployer SA scope:** the bootstrap `gh-deployer` roles now also include
  `redis.admin` + `compute.networkAdmin` to provision Memorystore + the VPC.
  Consider splitting into a narrow app-deploy SA + a separate provisioner SA.

> Terraform is not installed in this authoring environment, so `terraform
> validate`/`fmt` were not run here; HCL was written against the google
> provider v5/v6 schema. Run `terraform init && terraform validate` in each
> layer before first apply.
