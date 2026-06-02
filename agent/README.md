# Agent

A minimal Gemini (via Vertex AI) LangGraph agent with one tool, served by the
LangGraph Agent Server. The compiled graph is exported as `agent` in
[agent.py](agent.py) and discovered via [langgraph.json](langgraph.json).

## Local development

```powershell
# From the repo root: create/activate a venv, then install this package + dev tools.
uv sync --extra dev --extra inmem   # or: pip install -e ".[dev,inmem]"

# Authenticate to GCP once (uses Application Default Credentials for Vertex AI):
gcloud auth application-default login

# Copy env and fill in your project:
Copy-Item .env.example .env

# Single-turn smoke test (no server, no persistence):
python agent.py

# Serve for the UI (in-memory checkpointer, dev only):
langgraph dev
```

## Quality gates (run from `agent/`)

```powershell
ruff check .            # lint
ruff format --check .   # format gate
mypy                    # type-check
pytest                  # hermetic smoke test (model mocked, no GCP/network)
```

## Dependencies & reproducibility

`pyproject.toml` is the source of truth (compatible-release constraints). Generate
a fully pinned + hashed lockfile before relying on reproducible installs:

```powershell
uv lock
uv export --format requirements-txt --no-emit-project --no-dev -o requirements.txt
```

See [requirements.txt](requirements.txt) for the lock workflow.

## Production note

The in-memory checkpointer is **not** production-safe. Deployed environments must
use a durable Postgres checkpointer via `DATABASE_URI` (Cloud SQL). The serving
model for production is an open decision — see `docs/environments.md` and the
TODOs in [agent.py](agent.py) / `agent/Dockerfile`.
