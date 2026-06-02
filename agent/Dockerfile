# syntax=docker/dockerfile:1
#
# Agent service — self-hosted, PRODUCTION LangGraph Agent Server on Cloud Run.
#
# BUILD CONTEXT: the `agent/` directory.
#   docker build -f agent/Dockerfile -t \
#     us-central1-docker.pkg.dev/<project_id>/containers/agent:<git_sha> agent/
#
# ---------------------------------------------------------------------------
# SERVING MODEL (decision D2 — self-hosted production server, durable persistence)
#
# This image is based on `langchain/langgraph-api`, the SAME base the LangGraph
# CLI (`langgraph build` / `langgraph dockerfile`) produces. That base ships the
# production ASGI Agent Server with its entrypoint already baked in — we do NOT
# hand-author a CMD, and we do NOT use `langgraph dev` (in-memory, dev-only, not
# durable and not even installed here).
#
# Persistence is injected BY THE SERVER, configured purely via env (Terraform):
#   DATABASE_URI  - Cloud SQL Postgres conn string  -> durable checkpointer + store
#   REDIS_URI     - Memorystore (Redis) conn string -> task queue / pub-sub (REQUIRED;
#                   the standalone server cannot run Postgres-only)
# Because the server owns the checkpointer, agent.py exports a checkpointer-free
# compiled graph (do NOT add PostgresSaver in agent.py — it would conflict).
#
# LICENSE: the standalone production server REQUIRES a LangGraph Platform license
# validated at startup. Supply LANGGRAPH_CLOUD_LICENSE_KEY (or LANGSMITH_API_KEY)
# via Secret Manager in Terraform — without it the server will not start. The
# server also egresses to https://beacon.langchain.com for verification unless
# you hold an air-gapped key.
#
# PORT (the single biggest Cloud Run gotcha): the baked entrypoint serves on
# port 8000 internally and does NOT read $PORT. Do NOT try to override the bind
# port. Instead, set Cloud Run's containerPort = 8000 in Terraform (Cloud Run
# sends requests to the container port you configure). EXPOSE 8000 documents it.
#
# HEALTH: the server exposes a health endpoint at `/ok` (use it for the Cloud
# Run startup/liveness probe, configured in Terraform).
#
# VERIFY-BEFORE-CODING (could not pin to a verbatim string offline): confirm the
# baked ENTRYPOINT/CMD and internal port with `docker inspect langchain/langgraph-api:0.2`
# and/or `langgraph dockerfile` on this repo's langgraph.json. The Docker daemon
# was unavailable in this environment; see decisions_needed.
# ---------------------------------------------------------------------------

# Pin the server to a reproducible API version (matches langgraph.json api_version).
FROM langchain/langgraph-api:0.2

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # App env contract — values supplied by Cloud Run / Terraform / Secret Manager:
    #   GOOGLE_CLOUD_PROJECT          - GCP project for Vertex AI
    #   GOOGLE_CLOUD_LOCATION         - Vertex region (us-central1)
    #   DATABASE_URI                  - Cloud SQL Postgres (durable checkpointer + store)
    #   REDIS_URI                     - Memorystore Redis (task queue / pub-sub, REQUIRED)
    #   LANGGRAPH_CLOUD_LICENSE_KEY   - standalone-server license (Secret Manager)
    #   LANGSMITH_API_KEY / LANGSMITH_TRACING - optional tracing (Secret Manager)
    GOOGLE_CLOUD_LOCATION=us-central1

WORKDIR /app

# Application runtime deps. The base image already provides the Agent Server
# runtime (langgraph-api) and the Postgres/Redis drivers it manages; here we add
# ONLY our application's libraries (LangChain + the Gemini/Vertex provider +
# LangGraph core). requirements.txt is the locked, hashed set (see its header).
# We deliberately do NOT pip-install langgraph-api / langgraph-checkpoint-postgres
# / psycopg by hand — the base image owns those and the server-managed persistence.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application source: langgraph.json declares the graph ("agent" -> ./agent.py:agent).
# The baked entrypoint loads langgraph.json from the working directory at startup.
COPY langgraph.json agent.py ./

# Document the internal server port (8000). Cloud Run's containerPort must match
# (set in Terraform); the entrypoint does not honor $PORT.
EXPOSE 8000

# No CMD / ENTRYPOINT: the langchain/langgraph-api base image's baked production
# ASGI entrypoint runs the self-hosted Agent Server. Overriding it would break
# the supported serving model (see SERVING MODEL note above).
