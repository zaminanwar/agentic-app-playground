# Agent

A Gemini (via Vertex AI) **deep research agent**, served by the LangGraph Agent
Server. Built with [Deep Agents](https://github.com/langchain-ai/deepagents)
(`create_deep_agent`) — a batteries-included harness on top of LangChain's
`create_agent` that adds planning (`write_todos`), a virtual filesystem, and
subagent delegation (`task`). The orchestrator plans a question into steps,
delegates focused web searches to a `research-agent`, drafts a cited report to
`final_report.md`, has a `critique-agent` review it, then returns the report.

The compiled graph is exported as `agent` in [agent.py](agent.py) and discovered
via [langgraph.json](langgraph.json) — the same contract as before, so the CI/CD
and deploy pipeline are unchanged.

## Web search (Tavily)

Live research uses [Tavily](https://tavily.com). Set `TAVILY_API_KEY` (see
[.env.example](.env.example)) to enable it. Without the key the agent still runs,
but the search tool returns an "unavailable" message instead of results — so
tests and the deploy stay green. In deployed envs supply the key via Secret
Manager and inject it into the Agent Server environment (see `infra/`).

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
