# Before first deploy — placeholder & prerequisite checklist

Nothing deploys until every placeholder below is replaced with a real value and
every prerequisite resource exists. Items are grouped by where they live. This
list is exhaustive on purpose — a single missing value (a wrong WIF owner, a
mismatched check name, an absent license key) silently blocks the whole pipeline.

## 1. GitHub identity & ownership

- [ ] **`github_owner`** — set the WIF provider's `attribute_condition` to pin
      `assertion.repository_owner == "<github_owner>"` in Terraform
      (`infra/bootstrap` / WIF module). Without it, **any** GitHub repo could
      impersonate the deployer SA. Replace `<github_owner>` with your GitHub
      org/user login.
- [ ] **WIF pool/provider exist** — pool `github-pool`, provider
      `github-provider`, created by the bootstrap Terraform in each project, with
      IAM bindings allowing this repo (ideally the `main` ref / `prod`
      environment) to impersonate the deployer SA.

## 2. CODEOWNERS & approver teams (replace placeholders)

In [`.github/CODEOWNERS`](../.github/CODEOWNERS), replace every `@your-org/*`
placeholder with real GitHub teams that have **write** access to the repo:

- [ ] `@your-org/maintainers` (catch-all + `/docs/`)
- [ ] `@your-org/agent-team` (`/agent/`)
- [ ] `@your-org/frontend-team` (`/ui/`)
- [ ] `@your-org/platform-team` (`/infra/`, `/.github/`)
- [ ] **`@your-org/release-approvers`** — the prod approver team. Set it as the
      **Required reviewers** on the GitHub `prod` Environment (this is the manual
      approval gate before the prod `terraform apply`).

## 3. Branch protection

- [ ] Apply the `main` ruleset and select the **exact** CI job names as required
      status checks. See [docs/branch-protection.md](branch-protection.md) — the
      contexts must match the `name:` of each job (`agent lint, format,
      typecheck, test`; `ui lint, format, typecheck, build`; the infra-plan job)
      or merges hang forever.
- [ ] Verify the contexts actually report with
      `gh api /repos/<owner>/<repo>/commits/<sha>/check-runs`.

## 4. GitHub Actions variables & secrets

CD (`cd.yml`) and the infra-plan workflow read these. Set under **Settings →
Secrets and variables → Actions** (repo-level), with per-Environment overrides
where noted.

**Repository variables (`vars.*`) — non-sensitive:**

- [ ] `GCP_REGION` = `us-central1`
- [ ] `DEV_PROJECT_ID` = `agentic-app-dev`
- [ ] `PROD_PROJECT_ID` = `agentic-app-prod`

> Note: there is **no** `DEV_AGENT_URL` / `NEXT_PUBLIC_API_URL` anymore. The
> agent URL is wired to the web service as the runtime env var `AGENT_URL` **by
> Terraform**, not by CD, so the web image stays env-agnostic.

**Repository secrets (`secrets.*`) — sensitive / identity:**

- [ ] `WIF_PROVIDER` — full provider resource name
      `projects/<DEV_PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- [ ] `DEV_DEPLOYER_SA` = `gh-deployer@agentic-app-dev.iam.gserviceaccount.com`
- [ ] `PROD_DEPLOYER_SA` = `gh-deployer@agentic-app-prod.iam.gserviceaccount.com`

> Runtime SAs (`run-agent@`, `run-web@`) and their IAM (including the web SA's
> `run.invoker` on the agent) are created and bound **in Terraform**, so they no
> longer need to be passed to CD as secrets.

**GitHub Environments:**

- [ ] `dev` — deployment branch `main` only; no reviewers.
- [ ] `prod` — deployment branch `main` only; **Required reviewers** =
      `@your-org/release-approvers`; optional wait timer.

## 5. GCP per-project prerequisites (Terraform-provisioned)

For **each** project (`agentic-app-dev`, `agentic-app-prod`):

- [ ] tfstate bucket exists (`agentic-app-tfstate-dev` / `-prod`).
- [ ] Artifact Registry repo `containers` exists; deployer SA has
      `artifactregistry.writer`.
- [ ] Runtime SAs created: `run-agent@`, `run-web@` with the roles in
      [docs/environments.md](environments.md#runtime-identity--app-config).
- [ ] **Cloud SQL Postgres** instance + database + user; connection string
      stored in Secret Manager and referenced by Terraform as **`DATABASE_URI`**.
- [ ] **Memorystore (Redis)** instance on the authorized VPC; connection string
      wired to the agent as **`REDIS_URI`** (mandatory — the server needs it).
- [ ] **VPC access for Cloud Run → Memorystore**: either Direct VPC egress
      (recommended) or a Serverless VPC Access connector (`/28`) in
      `us-central1`, in the VPC authorized on the Memorystore instance. Capture
      the network/subnet/connector names as Terraform vars.
- [ ] **LangGraph license** secret: `LANGGRAPH_CLOUD_LICENSE_KEY` (or
      `LANGSMITH_API_KEY`) in Secret Manager — the production server will not
      start without it. Ensure egress to `https://beacon.langchain.com` unless
      using an air-gapped key.
- [ ] Cloud Run **agent** service: `allow_unauthenticated = false`; container
      port **`8000`**; startup/health probe `/ok`.
- [ ] Cloud Run **web** service: `allow_unauthenticated = true`; runtime env
      `AGENT_URL` = the agent service's internal URL (Terraform output).

## 6. Memorystore / VPC values to capture (Terraform vars)

Fill these in the env tfvars before `terraform apply`:

- [ ] VPC network name + region (`us-central1`).
- [ ] Subnet (and `/28` range if using a Serverless VPC connector).
- [ ] Memorystore instance host/port → composed into `REDIS_URI`.
- [ ] Cloud SQL instance connection name → composed into `DATABASE_URI`.

## Sanity check before merging the first change to `main`

1. `terraform plan` in `infra/envs/dev` succeeds and shows the expected agent +
   web services, Cloud SQL, Memorystore, VPC access, and IAM bindings.
2. The infra-plan CI job runs on an `infra/**` PR and posts a green check.
3. CODEOWNERS reviewers are auto-requested on a test PR.
4. The `prod` Environment shows the required-reviewers gate.
