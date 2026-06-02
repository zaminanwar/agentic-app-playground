# syntax=docker/dockerfile:1
#
# Web service (Next.js standalone) — Cloud Run image.
#
# BUILD CONTEXT: the pnpm workspace root `ui/` (NOT ui/apps/web), because the
# build needs the workspace lockfile + pnpm-workspace.yaml + turbo config:
#
#   docker build \
#     -f ui/apps/web/Dockerfile \
#     -t us-central1-docker.pkg.dev/<project_id>/containers/web:<git_sha> \
#     ui/
#
# RUNTIME: Cloud Run injects $PORT (default 8080). The standalone server binds
# to 0.0.0.0:$PORT via the HOSTNAME/PORT env vars Next's server.js reads.
#
# ENV-AGNOSTIC IMAGE (decision D3): the browser uses a SAME-ORIGIN BFF proxy
# (`/api/agent`), so the agent's URL is NOT baked into the build. There is NO
# NEXT_PUBLIC_API_URL build arg. The agent's internal Cloud Run URL is supplied
# at RUNTIME via the server-side `AGENT_URL` env var (set by Terraform / the
# proxy reads it). This makes ONE image genuinely promotable dev -> prod.

# ------------------------------- Base ---------------------------------------
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
# Pin Corepack-managed pnpm to the workspace's packageManager (ui/package.json).
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

# ------------------------------- Builder ------------------------------------
# Install with the FULL workspace present, then build, in ONE stage. Copying
# pnpm's symlinked node_modules across build stages breaks the .pnpm store
# links (Next then can't resolve its own binary), so we don't split it.
FROM base AS builder
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# No NEXT_PUBLIC_API_URL: the browser calls the same-origin `/api/agent` proxy,
# and the agent URL is provided at runtime (AGENT_URL), not baked in. Only the
# fixed assistant id is inlined; it is a stable shared convention, not per-env.
ENV NEXT_PUBLIC_ASSISTANT_ID=agent \
    NEXT_TELEMETRY_DISABLED=1

# Build the `web` app directly (build:internal == `next build`); next.config.mjs
# has output: "standalone". Calling build:internal avoids nesting turbo inside a
# pnpm filter in the container.
RUN pnpm --filter web run build:internal

# Ensure a public/ dir exists so the runtime COPY below never fails, even when
# the app ships no static public assets.
RUN mkdir -p apps/web/public

# ------------------------------- Runtime ------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Cloud Run sets $PORT; default 8080 for local `docker run` parity.
    PORT=8080 \
    # Next's standalone server.js reads HOSTNAME to choose the bind address.
    HOSTNAME=0.0.0.0
# RUNTIME REQUIREMENT: `AGENT_URL` (the agent's internal Cloud Run URL) must be
# injected at runtime by Terraform so the same-origin `/api/agent` proxy knows
# where to forward and which OIDC audience to mint. It is intentionally NOT set
# here so the image is env-agnostic / promotable across dev and prod.

# Non-root, unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output for a monorepo nests the app under apps/web and places the
# pruned, traced node_modules at the standalone root.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Static assets and the public dir are NOT included in standalone; copy them
# into the same nested location the standalone server expects.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 8080

# The standalone entrypoint for the `web` package lives at apps/web/server.js.
# Shell form so Cloud Run's $PORT is expanded at container start.
CMD exec node apps/web/server.js
