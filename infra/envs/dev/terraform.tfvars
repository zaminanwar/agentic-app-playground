# =============================================================================
# terraform.tfvars (dev) — non-secret, stable inputs for the dev environment.
#
# image_tag is intentionally NOT set here: CI supplies it per deploy via
# `-var image_tag=<git_sha>` (or TF_VAR_image_tag). For a manual local plan,
# pass it on the command line, e.g.:
#   terraform plan -var image_tag=local-dev
# =============================================================================

project_id = "agentic-app-dev"
region     = "us-central1"

# Optional: LangSmith tracing flag for the agent (uncomment to enable).
# Pair with a LANGSMITH_API_KEY secret created in the module.
# langsmith_tracing = "true"

# NOTE: there is no NEXT_PUBLIC_API_URL anymore. The web image is env-agnostic;
# the agent's URL is injected at RUNTIME as AGENT_URL by the module.
