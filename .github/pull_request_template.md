## What & why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Checklist

- [ ] Tests added/updated and passing locally (`agent`: pytest / `ui`: turbo test)
- [ ] Lint & format pass (`agent`: ruff/black · `ui`: `pnpm lint` + `pnpm format`)
- [ ] Docs updated (README / `docs/` / inline) if behavior or setup changed
- [ ] Env vars: runtime config (env/secrets/SA/probes) is owned by **Terraform**, not CD. Any new/changed runtime var is set in `infra/` and reflected in `docs/` (one source of truth). Agent uses `DATABASE_URI` (Postgres) + `REDIS_URI` (Redis); web uses runtime `AGENT_URL`. There is **no** `NEXT_PUBLIC_API_URL` build arg.
- [ ] Infra: if `infra/` changed, the PR-time `ci-infra` plan was reviewed and is intentional (CD applies it via `terraform apply -var image_tag=<sha>`)
- [ ] No secrets / long-lived keys committed (CI→GCP auth is Workload Identity Federation)
- [ ] Scoped to one logical change; ready to **squash-merge** into a linear `main`

## Deploy / promotion notes

<!--
Merging to main builds both images at the git SHA, then runs
`terraform apply -var image_tag=<sha>` against DEV automatically. Promotion to
PROD re-applies the SAME sha behind the manual `prod` Environment approval
(never rebuilt). The agent is PRIVATE; the browser reaches it only through the
same-origin Next.js BFF. Note anything reviewers/approvers should watch
(DB migrations, new secrets, VPC/Memorystore changes, config that must exist in
prod first, etc.).
-->
