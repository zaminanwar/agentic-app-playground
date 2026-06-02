# Contributing

## Branching model — trunk-based

- `main` is the single long-lived branch and is always releasable.
- Create **short-lived feature branches** off `main` (`feat/...`, `fix/...`),
  rebase often, and open a PR early.
- **PRs are required** — no direct pushes to `main`. Branch protection enforces
  this (see [docs/branch-protection.md](docs/branch-protection.md)).
- Merge only when **CI is green** and the PR is approved.
- **Squash-merge** to keep a **linear history** (one commit per change on `main`).
- Keep PRs small and focused on one logical change.

## Local dev quickstart

Platform note: local dev is on Windows; CI/CD runs on `ubuntu-latest`. The
commands below work in PowerShell.

### Agent (Python LangGraph)

```powershell
cd agent
uv sync --extra dev --extra inmem      # creates agent/.venv: app + dev tools + local server CLI
copy .env.example .env                 # then set GOOGLE_CLOUD_PROJECT
gcloud auth application-default login  # one-time, for Vertex AI

uv run langgraph dev --no-browser      # http://localhost:2024 (hot-reload, in-memory)
```

Smoke-test without the server: `uv run python agent.py`. Quality gates CI runs
(from `agent/`): `uv run ruff check .`, `uv run ruff format --check .`,
`uv run mypy`, `uv run pytest`.

> `langgraph dev` is the free **in-memory** dev server — fine locally, **not**
> production. The deployed self-hosted LangGraph Server uses a durable Cloud SQL
> Postgres checkpointer (`DATABASE_URI`) + Memorystore Redis (`REDIS_URI`) and
> requires a LangGraph Platform license. See [docs/environments.md](docs/environments.md).

### UI (Next.js, pnpm + turbo)

```powershell
cd ui
pnpm install
copy apps\web\.env.example apps\web\.env    # AGENT_URL=http://localhost:2024
pnpm run dev                                # http://localhost:3000
```

The browser talks **only** to the web app; its same-origin BFF proxy
(`/api/agent`) forwards server-side to the agent at `AGENT_URL` (locally
`http://localhost:2024`). Before pushing (matches CI):

```powershell
pnpm lint
pnpm --filter web format:check
pnpm --filter web exec tsc --noEmit
pnpm build
```

## Environments & promotion

Two GCP projects give hard isolation: **dev** (`agentic-app-dev`) and **prod**
(`agentic-app-prod`), both in `us-central1`.

- **Merge to `main`** → CD builds both images once (tagged with the immutable
  git SHA), pushes them, then runs `terraform apply -var image_tag=<sha>`
  against `infra/envs/dev` → **auto-deploy to dev**. Terraform owns Cloud Run.
- **Promote to prod** → the **same image SHA** is applied to `infra/envs/prod`
  behind a manual approval (GitHub `prod` Environment). **Never rebuilt**.

Full topology, diagram, and the GitHub Environments to create:
[docs/environments.md](docs/environments.md).
