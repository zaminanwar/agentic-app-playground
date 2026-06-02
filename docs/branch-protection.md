# Branch protection — enforcing trunk-based development

> These are settings a **human (repo admin)** applies in GitHub. Files in the
> repo can describe the policy but **cannot enforce** it — the rules live in
> GitHub's repository settings / rulesets, not in version control.

## Goal

`main` is the single protected trunk. All change lands via PR, with green CI and
a linear history.

## Settings to apply to `main`

Apply via **Settings → Rules → Rulesets → New branch ruleset** (preferred) or
the legacy **Settings → Branches → Branch protection rules**.

- **Target branch:** `main` (default branch).
- **Require a pull request before merging**
  - Required approvals: **1** (raise to 2 if team size allows).
  - **Dismiss stale pull request approvals when new commits are pushed.**
  - **Require review from Code Owners** (uses [`.github/CODEOWNERS`](../.github/CODEOWNERS)).
- **Require status checks to pass before merging**
  - **Require branches to be up to date before merging.**
  - Required checks — select the CI **job names** below.
- **Require linear history** (forces squash/rebase; blocks merge commits).
- **Block force pushes** to `main`.
- **Restrict deletions** of `main`.
- **Require conversation resolution before merging.**
- Recommended repo-wide merge setting (**Settings → General → Pull Requests**):
  enable **only** "Allow squash merging"; disable merge commits and rebase
  merging so every PR lands as a single linear commit.

### Required status checks (job names)

GitHub matches a required status check by the **`name:` of the job** (not the
workflow `name:` and not the workflow filename). There is **no `ci.yml`** — CI
is split per area into independent path-filtered workflows. The contexts below
are the exact `name:` values from each workflow's job.

| Workflow file | Job | Required-check **context** (job `name:`) |
|---|---|---|
| `.github/workflows/ci-agent.yml` | `agent-checks` | `agent lint, format, typecheck, test` |
| `.github/workflows/ci-ui.yml` | `ui-checks` | `ui lint, format, typecheck, build` |
| `.github/workflows/ci-infra.yml` | `infra-plan` | `infra fmt, validate, plan` |

`ci-infra` is the **PR-time infra check** (read-only via WIF): `terraform
fmt -check`, `terraform validate`, and `terraform plan` on PRs touching
`infra/**`. It is intended to be a required status check.

> Important — path-filtered checks: `ci-agent`, `ci-ui`, and `ci-infra` each run
> only when their paths change (`agent/**`, `ui/**`, `infra/**`). A required
> check that is **not triggered** on a given PR stays **pending**, which blocks
> the merge. Two ways to handle this:
>
> - **(Preferred) Add a single always-green aggregator job** that depends on the
>   per-area jobs and is the *only* required context. Implement it with a
>   `paths-ignore`-free workflow that always runs (e.g. a `ci` workflow on every
>   PR whose one job `needs:` the others, or uses the
>   [dorny/paths-filter] pattern to pass when a path is untouched). If/when that
>   aggregator job exists, make **it** the sole required context and drop the
>   three per-area contexts. (No aggregator exists in the repo today — the three
>   jobs above are the current source of truth.)
> - **Or** keep each path-filtered workflow but add a no-op "skip" job under the
>   same `name:` for the untouched paths so the context always reports.
>
> Until an aggregator exists, require all three contexts and accept that a
> docs-only PR (touching none of the three paths) will not be blocked by them.

> Confirm contexts against reality — see "Verifying contexts" at the bottom.
> `ci-infra.yml` / its `infra-plan` job is owned by the CI/CD scaffold; if its
> job `name:` differs from `infra fmt, validate, plan`, use the actual value.

## Optional: apply a ruleset with the `gh` CLI

Rulesets can be created from JSON via the REST API. Save the file below, then
push it. Re-run to update (the API is create-only per call; delete the old
ruleset first or use the web UI to edit).

`main-ruleset.json`:

```json
{
  "name": "main-trunk",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "agent lint, format, typecheck, test" },
          { "context": "ui lint, format, typecheck, build" },
          { "context": "infra fmt, validate, plan" }
        ]
      }
    }
  ]
}
```

Apply it (requires repo admin and `gh auth login`):

```bash
# from the repo root; replace OWNER/REPO
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/OWNER/REPO/rulesets \
  --input docs/main-ruleset.json
```

## Verifying contexts

A required-status-check context is only valid if a job actually reports it.
Confirm the live check-run names from a recent PR head commit before locking the
ruleset, so you don't pin a context that never reports (which blocks merges):

```bash
# list the check-run names GitHub actually received for a commit
gh api /repos/OWNER/REPO/commits/<sha>/check-runs \
  --jq '.check_runs[].name'
```

The strings printed here are exactly what belong in `required_status_checks[].context`.

Verify the ruleset itself:

```bash
gh api /repos/OWNER/REPO/rulesets
```
