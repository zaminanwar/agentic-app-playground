# =============================================================================
# variables.tf (prod) — inputs for the prod environment root.
#
# CI promotes the SAME image (same git SHA) that was deployed to dev, behind a
# manual approval (GitHub 'prod' Environment protection). image_tag is supplied
# per deploy; everything else is stable in terraform.tfvars / the module.
# =============================================================================

variable "project_id" {
  description = "GCP project ID for the prod environment."
  type        = string
  default     = "agentic-app-prod"
}

variable "region" {
  description = "GCP region for all regional resources."
  type        = string
  default     = "us-central1"
}

variable "image_tag" {
  description = "Immutable image tag (git SHA) PROMOTED from dev — never rebuilt between envs. Supplied by CI."
  type        = string
}

variable "agent_image" {
  description = "Optional explicit agent image reference (overrides the convention path / shared registry)."
  type        = string
  default     = null
}

variable "web_image" {
  description = "Optional explicit web image reference (overrides the convention path / shared registry)."
  type        = string
  default     = null
}

variable "langsmith_tracing" {
  description = "If set (e.g. 'true'), exposes LANGSMITH_TRACING to the agent. Pair with a LANGSMITH_API_KEY secret."
  type        = string
  default     = null
}
