# agentic-app-playground

A minimal-but-complete agentic app: a **Python LangChain/LangGraph agent**
(Gemini via Vertex AI) with a tool and persistent state, fronted by a
**TypeScript chat UI** you own and host.

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                  │
│     │                                                     │
│     ▼                                                     │
│  ui/  (Next.js chat UI)            :3000                  │
│     │   useStream / Agent Server protocol                 │
│     ▼                                                     │
│  agent/  (Python agent server)     :2024  ──► Vertex AI   │
│            persistence (checkpointer)            (Gemini) │
└─────────────────────────────────────────────────────────┘
```

Both halves live in this repo and are 100% yours — nothing is served by a
third party.

## What's here

| Path | What it is |
|------|------------|
| [agent/](agent/) | Python agent: `create_agent` + one tool, served by the LangGraph Agent Server |
| [ui/](ui/) | Forked [Agent Chat UI](https://docs.langchain.com/oss/python/langchain/ui) (Next.js), pointed at the Python agent |

## Run it locally

Two terminals.

### 1. The agent (terminal A)

The virtual environment lives at the repo root, *outside* `agent/`, so the
`langgraph dev` file-watcher doesn't loop on the venv's files (which would force
`--no-reload`). Keeping it separate lets hot-reload work normally.

```bash
# from the repo root:
python -m venv .venv
.venv\Scripts\activate          # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r agent/requirements.txt

cd agent
copy .env.example .env          # then fill in your GCP project
gcloud auth application-default login   # one-time, for Vertex AI

langgraph dev                   # serves the agent at http://localhost:2024 (hot-reload on)
```

Smoke-test the agent without the UI: `python agent.py` (from `agent/`)

### 2. The UI (terminal B)

```bash
cd ui
pnpm install
pnpm run dev                    # http://localhost:3000
```

Open http://localhost:3000 — it auto-connects to the agent at
`localhost:2024` (configured in [ui/apps/web/.env](ui/apps/web/.env)) and you
can chat with it.

## Going to production on GCP

The same pieces deploy without rework:

- **Agent** → containerize `agent/` and deploy to **Cloud Run**; swap the
  in-memory checkpointer for **Cloud SQL (Postgres)** for durable state.
- **UI** → build `ui/` and deploy to **Cloud Run** (or static hosting); set
  `NEXT_PUBLIC_API_URL` to the agent's Cloud Run URL.
- **Model** → already on **Vertex AI**, so it stays inside your GCP org.
