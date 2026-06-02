# =============================================================================
# terraform.tfvars (prod) — non-secret, stable inputs for the prod environment.
#
# image_tag is intentionally NOT set here: CI promotes the SAME git SHA that
# was validated in dev, supplied via `-var image_tag=<git_sha>` behind the
# GitHub 'prod' Environment manual approval. NEVER rebuild between envs.
# =============================================================================

project_id = "agenticapp-zan-prod"
region     = "us-central1"

# Optional: LangSmith tracing flag for the agent (uncomment to enable).
# langsmith_tracing = "true"

# NOTE: there is no NEXT_PUBLIC_API_URL anymore. The web image is env-agnostic;
# the agent's URL is injected at RUNTIME as AGENT_URL by the module.
