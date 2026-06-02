# =============================================================================
# variables.tf (dev) — inputs for the dev environment root.
#
# Most module knobs have sensible defaults in the module itself and in this
# layer's terraform.tfvars. The only value CI must supply per deploy is the
# immutable image tag (the git SHA), passed with -var or TF_VAR_image_tag.
# =============================================================================

variable "project_id" {
  description = "GCP project ID for the dev environment."
  type        = string
  default     = "agentic-app-dev"
}

variable "region" {
  description = "GCP region for all regional resources."
  type        = string
  default     = "us-central1"
}

variable "image_tag" {
  description = "Immutable image tag (git SHA) to deploy for BOTH services. Supplied by CI on merge to main."
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
