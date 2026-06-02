# `bootstrap` — one-time WIF + tfstate + deployer-SA foundation

This layer is applied **once**, **before** the env layers, by a human with
owner/admin rights on both GCP projects. It creates the things the env layers
and the CD pipeline depend on but cannot create for themselves:

- **GCS tfstate buckets** (versioned, uniform access, public access prevented)
  — `agentic-app-tfstate-dev` and `agentic-app-tfstate-prod`. These are exactly
  what `infra/envs/<env>/backend.tf` point at.
- **Workload Identity Federation** — pool `github-pool` + provider
  `github-provider` in the WIF-hosting project, restricted to **this GitHub
  repo** via an `attribute_condition`. GitHub Actions authenticates by OIDC;
  **no long-lived JSON keys** exist anywhere.
- **Per-env deployer service accounts** — `gh-deployer@<project>` in each env
  project, each granted least-privilege roles (Cloud Run admin, Artifact
  Registry writer, actAs runtime SAs, Secret Manager, Cloud SQL, Service Usage,
  Storage for state, plus SA/IAM admin so the env layer can create the runtime
  SAs and bind their roles). Each SA is bound with
  `roles/iam.workloadIdentityUser` to the repo's WIF identities.

## Chicken-and-egg: why bootstrap uses LOCAL state

This layer **creates the GCS buckets** that the env layers use as their remote
backend. It therefore cannot itself store state in those buckets on the first
apply — so `infra/bootstrap/main.tf` has **no `backend` block** and runs on
**local state** (`terraform.tfstate` in this directory).

Two supported options after the first apply:

1. **Keep local state** for bootstrap and store `terraform.tfstate` securely
   (it is rarely changed). Simplest; recommended for a small team.
2. **Migrate bootstrap state into a bucket** after the buckets exist: add a
   `backend "gcs"` block (e.g. bucket `agentic-app-tfstate-dev`, prefix
   `bootstrap`) and run `terraform init -migrate-state`.

## Apply order (whole repo)

```
bootstrap  ->  envs/dev  ->  envs/prod
```

`bootstrap` must complete first (buckets + WIF + deployer SAs exist), then the
env layers can `terraform init` against their GCS backends and authenticate via
WIF in CI. See `infra/README.md` for the full per-env commands.

## How to apply (run by an admin, locally)

```bash
# Authenticate as a human with admin on BOTH projects.
gcloud auth application-default login

cd infra/bootstrap
terraform init                       # local state
terraform apply \
  -var github_owner=<your-gh-org>    # REQUIRED: the real repo owner
```

Set at least `github_owner` (defaults to a placeholder). `github_repo` defaults
to `agentic-app-playground`. Project IDs / bucket names / pool ids default to
the shared conventions.

## Outputs to wire into CI

After apply, copy these into the GitHub Actions workflow / repo variables:

| Output | Used as |
|---|---|
| `workload_identity_provider` | `workload_identity_provider` input of `google-github-actions/auth` |
| `deployer_service_account_dev` | `service_account` input for the **dev** deploy job |
| `deployer_service_account_prod` | `service_account` input for the **prod** (promotion) deploy job |
| `tfstate_bucket_dev` / `tfstate_bucket_prod` | confirm they match the env `backend.tf` |

The GitHub **`prod` Environment** (manual approval protection rule) is created
in the GitHub repo settings, not here — it gates the promotion job that uses
`deployer_service_account_prod`.

## Security notes / decisions

- The WIF provider is locked to the repo via
  `attribute_condition = assertion.repository == "<owner>/<repo>"`, and each
  deployer SA is impersonable only by that repo's identities
  (`principalSet .../attribute.repository/<owner>/<repo>`). Branch/Environment
  gating is enforced in the workflow + GitHub Environment approval (so PR
  `plan` jobs can still authenticate). If you want IAM-level branch restriction,
  tighten the `principalSet` to `attribute.ref/refs/heads/main` — **TODO /
  decision**, see `decisions_needed`.
- `deployer_roles` are deliberately broad enough for the **env layer** to run
  end-to-end (it provisions Cloud SQL, secrets, runtime SAs and their IAM). If
  you split infra-provisioning from app-deploy, narrow the app-deploy SA to
  `run.admin` + `artifactregistry.writer` + `iam.serviceAccountUser` and keep a
  separate provisioner SA — **TODO / decision**.
