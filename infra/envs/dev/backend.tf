# =============================================================================
# backend.tf (dev) — remote Terraform state in GCS.
#
# Per shared conventions: one tfstate bucket per env.
#   dev  -> agentic-app-tfstate-dev
#   prod -> agentic-app-tfstate-prod
#
# The bucket itself is created ONCE by infra/bootstrap (which starts on LOCAL
# state — see infra/bootstrap/README.md for the chicken-and-egg explanation).
# After the bucket exists, run `terraform init` here to use the GCS backend.
#
# NOTE: backend blocks cannot use variables; the bucket name is a literal.
# =============================================================================

terraform {
  backend "gcs" {
    bucket = "agenticapp-zan-tfstate-dev"
    prefix = "env/dev"
  }
}
