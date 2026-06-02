# Environments & promotion

## Two-project model (hard isolation)

Each environment is a **separate GCP project** — no shared resources, blast
radius contained. Region is `us-central1` everywhere. (All literals below are
centralized as Terraform variables; values shown are the defaults.)

| Concern | Dev | Prod |
|---|---|---|
| GCP project (`project_id`) | `agentic-app-dev` | `agentic-app-prod` |
| Region (`region`) | `us-central1` | `us-central1` |
| Artifact Registry (Docker) | `containers` | `containers` |
| Cloud Run services | `agent`, `web` | `agent`, `web` |
| Terraform state bucket | `agentic-app-tfstate-dev` | `agentic-app-tfstate-prod` |
| Deployer SA | `gh-deployer@agentic-app-dev.iam.gserviceaccount.com` | `gh-deployer@agentic-app-prod.iam.gserviceaccount.com` |
| Agent runtime SA | `run-agent@agentic-app-dev.iam.gserviceaccount.com` | `run-agent@agentic-app-prod.iam.gserviceaccount.com` |
| Web runtime SA | `run-web@agentic-app-dev.iam.gserviceaccount.com` | `run-web@agentic-app-prod.iam.gserviceaccount.com` |

Service **names are identical** across environments — separation is by
**project**, not by a name suffix. Image path:

```
us-central1-docker.pkg.dev/<project_id>/containers/<service>:<git_sha>
```

## Topology (final design)

Three resolved decisions shape the runtime topology. They are **final** — the
rest of this document describes their consequences, not alternatives.

1. **Terraform owns Cloud Run.** Cloud Run services (and every runtime knob:
   env vars, secrets, runtime SA, probes, VPC access, container port) are
   managed **only** by Terraform. CD builds and pushes images, then runs
   `terraform apply -var image_tag=<sha>`. CD does **not** use the
   `deploy-cloudrun` action.
2. **Self-hosted LangGraph server with durable persistence.** The agent
   container runs the **production self-hosted LangGraph Agent Server**
   (built from `langchain/langgraph-api`, *not* `langgraph dev`), backed by
   **Cloud SQL Postgres** and **Memorystore Redis**.
3. **Same-origin BFF; private agent.** The browser talks **only** to the `web`
   service. A Next.js route handler proxies to the agent's internal Cloud Run
   URL, attaching a GCP-issued OIDC ID token, so the agent can stay
   **private** (`allow_unauthenticated=false`).

```
                         Internet (public)
                               │
                               ▼
                      ┌─────────────────┐
                      │  web (Cloud Run)│  allow_unauthenticated = true
   browser ──────────►│  Next.js + BFF  │
   (same origin only) │  route handler  │
                      └────────┬────────┘
                               │  server-side fetch to AGENT_URL,
                               │  Authorization: Bearer <OIDC ID token>
                               │  (audience = agent URL)
                               ▼
                      ┌─────────────────┐
                      │ agent (Cloud Run)│  allow_unauthenticated = false
                      │ self-hosted      │  (web runtime SA has run.invoker)
                      │ LangGraph server │
                      └───┬──────────┬──┘
                          │          │  (private, via VPC egress)
            DATABASE_URI  │          │  REDIS_URI
            (Cloud SQL)   ▼          ▼  (Memorystore)
                  ┌──────────────┐  ┌──────────────┐
                  │ Cloud SQL    │  │ Memorystore  │
                  │ Postgres     │  │ Redis        │
                  └──────────────┘  └──────────────┘
```

### Why the browser never sees the agent

The web image is **env-agnostic** — there is no `NEXT_PUBLIC_API_URL` build arg
anymore (removed from the Dockerfile and CD). The browser-side LangGraph SDK
client targets a **same-origin** base path (e.g. `/api/agent`) served by the
Next.js route handler. The handler forwards the SDK's endpoints (`/info`,
`/assistants*`, `/threads*`, `/runs/stream`, `/store/*`), preserving method,
body, query, and the `X-Api-Key` header, and **streams SSE / chunked responses
through unbuffered**. The agent's real URL is injected into the web service as a
**server-side runtime env var `AGENT_URL`** (set by Terraform), never baked into
the image. One image is therefore genuinely promotable dev → prod.

## Runtime identity & app config (source of truth: Terraform)

Because Terraform owns Cloud Run, **all** runtime configuration lives in
Terraform — there is **one source of truth**. CD passes only `image_tag`.

- Each Cloud Run service runs as a **dedicated least-privilege runtime SA**
  (never the default compute SA), created in Terraform:
  - **agent** (`run-agent@`): `roles/aiplatform.user` (Vertex),
    `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`.
  - **web** (`run-web@`): `roles/run.invoker` **on the agent service** (so the
    BFF can call the private agent), plus `roles/secretmanager.secretAccessor`
    if it reads secrets.
- CI/CD → GCP auth uses **Workload Identity Federation** (pool `github-pool`,
  provider `github-provider`) — **no long-lived JSON keys**. The WIF provider's
  `attribute_condition` must pin `assertion.repository_owner == "<github_owner>"`
  (see the first-deploy checklist).

### App env vars (set by Terraform on the Cloud Run services)

These are configured in `infra/modules/app` + the env tfvars, **not** in CD.

- **agent** (self-hosted LangGraph server):
  - `DATABASE_URI` — Cloud SQL Postgres connection string for the durable,
    server-managed checkpointer/store. (This is the LangGraph server's
    documented Postgres env var. It is **not** read by `agent.py`; the server
    injects the checkpointer itself.)
  - `REDIS_URI` — Memorystore Redis connection string. **Mandatory** — the
    self-hosted server uses Redis for run pub/sub and streaming; it cannot run
    Postgres-only.
  - `LANGGRAPH_CLOUD_LICENSE_KEY` (or `LANGSMITH_API_KEY`) — **required** for
    the production standalone server to start; supplied via Secret Manager.
  - `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=us-central1`.
  - **Container port `8000`** — the LangGraph-built image serves on `8000` and
    does **not** honour `$PORT`; Terraform sets the Cloud Run container port to
    `8000`.
  - Health/startup probe path: `/ok`.
- **web** (Next.js BFF):
  - `AGENT_URL` — the **agent's internal Cloud Run URL** (server-side runtime
    env, set by Terraform from the agent service output). Used as the OIDC
    audience and proxy target. **Not** a `NEXT_PUBLIC_*` value.

> Renamed: the earlier `DATABASE_URI`-as-CD-secret wiring is gone. `DATABASE_URI`
> (Postgres) and the new mandatory `REDIS_URI` (Redis) are now set on the agent
> service **by Terraform**, sourced from Secret Manager / Cloud SQL / Memorystore
> outputs. There is no longer a runtime-SA or secret-name mismatch between CD and
> Terraform because CD no longer touches runtime config.

### VPC access (Cloud Run → Memorystore)

Memorystore Redis has only a **private IP** on a VPC, so Cloud Run must egress
into that VPC. Terraform provisions one of:

- **Direct VPC egress** (recommended): attach the agent service to the subnet
  peered with Memorystore's authorized network; route private ranges through the
  VPC; or
- a **Serverless VPC Access connector** in `us-central1` (a `/28` in the
  authorized VPC), with egress at least `private-ranges-only`.

Cloud SQL Postgres (`DATABASE_URI`) is reachable independently via the Cloud SQL
connector / private IP.

## Promotion flow (trunk-based, build once, Terraform applies)

The image is built **once** at the git SHA and promoted unchanged — never
rebuilt between environments. Cloud Run revisions are produced by
`terraform apply`, not by a deploy action.

```
   feature branch
        │  PR
        │   • ci-agent / ci-ui (lint, format, typecheck, test/build)
        │   • ci-infra (terraform fmt -check, validate, plan on infra/**)
        ▼
   merge to main ──► squash, linear history
        │
        ▼
  ┌───────────────────────────────────────────────┐
  │ build BOTH images once, tag = <git_sha>        │
  │   agent:<sha>   web:<sha>                       │
  │ push to Artifact Registry                       │
  └───────────────────────────────────────────────┘
        │
        ▼
  ┌───────────────────────────────────────────────┐
  │ terraform apply -var image_tag=<sha>            │
  │   against infra/envs/dev   (AUTOMATIC)          │
  └───────────────────────────────────────────────┘
        │
        │   manual approval (GitHub `prod` Environment)
        ▼
  ┌───────────────────────────────────────────────┐
  │ terraform apply -var image_tag=<sha>            │
  │   against infra/envs/prod  (SAME <git_sha>)     │
  │   — promote, never rebuild                      │
  └───────────────────────────────────────────────┘
```

Prod receives the **same** `<git_sha>` that passed dev. Both projects pull from
their own `containers` registry (CD pushes the image to both), so prod never
reads from a dev-owned registry.

## ROLLBACK runbook

Rollback is a **redeploy of a known-good prior git SHA — no rebuild**, because
images are immutable and Terraform owns the revision.

1. **Pick the target SHA.** Identify the last-good commit on `main` (the SHA tag
   already exists in Artifact Registry from its original build; nothing to
   rebuild).
2. **Re-apply that SHA via Terraform** against the affected env:

   ```bash
   # from infra/envs/prod (or .../dev)
   terraform apply -var image_tag=<good_sha>
   ```

   This creates a new Cloud Run revision pointing at the old image with the
   current Terraform-managed config. Re-running the CD workflow on the prior
   commit (which calls the same `terraform apply -var image_tag=<sha>`) is the
   pipeline-driven equivalent and still requires the `prod` approval.
3. **Verify** the new revision is serving and healthy (`/ok` for the agent;
   the web service through its same-origin proxy).
4. **Emergency traffic shift (fastest, infra-bypassing).** If you need to revert
   in seconds before re-running Terraform, shift traffic to the previous Cloud
   Run revision directly:

   ```bash
   gcloud run services update-traffic agent \
     --project <project_id> --region us-central1 \
     --to-revisions <previous_revision>=100
   ```

   This is a **stopgap**: Terraform still believes the latest revision should
   serve, so the **next** `terraform apply` will reconcile traffic back. Follow
   up immediately with a real `terraform apply -var image_tag=<good_sha>` so
   state and reality agree.
5. **Config-only rollback.** If the bad change was Terraform config (not the
   image), `git revert` the infra commit and let CD apply it — same flow, the
   `image_tag` is unchanged.

## GitHub Environments to create

Create under **Settings → Environments**. Environments gate the deploy jobs and
hold per-env secrets/vars (the WIF provider resource name, project id, etc.).

### `dev`

- **Deployment branches:** `main` only (selected branches → `main`).
- **Reviewers:** none (auto-apply on merge).
- **Secrets/vars (examples):** `GCP_PROJECT_ID=agentic-app-dev`,
  `GCP_WIF_PROVIDER` (full provider resource name),
  `GCP_DEPLOYER_SA=gh-deployer@agentic-app-dev.iam.gserviceaccount.com`.

### `prod`

- **Deployment branches:** `main` only.
- **Required reviewers:** the release approver team — this is the **manual
  approval** gate that fronts the promote-to-prod `terraform apply`.
  - TODO: set the approver team/users; placeholder `@your-org/release-approvers`
    (matches CODEOWNERS placeholders).
- **Optional wait timer:** consider a short timer for a cancel window.
- **Secrets/vars (examples):** `GCP_PROJECT_ID=agentic-app-prod`,
  `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA=gh-deployer@agentic-app-prod.iam.gserviceaccount.com`.

## Licensing note (production blocker)

The self-hosted standalone LangGraph Agent Server **requires a LangSmith /
LangGraph Platform license** for production. It validates a key at startup and
periodically. Set `LANGGRAPH_CLOUD_LICENSE_KEY` (standalone-server license) or
`LANGSMITH_API_KEY` (validated against LangSmith SaaS) via Secret Manager.
Without a valid license the server will not start. Unless you hold an air-gapped
key, the server egresses to `https://beacon.langchain.com` for license/usage
verification, so Cloud Run must be able to reach it. This is a Plus/Enterprise
entitlement — not free/OSS. Listed in `decisions_needed`.

## Before first deploy

See [docs/first-deploy-checklist.md](first-deploy-checklist.md) for the complete
list of placeholders to replace and resources to provision before anything works.
