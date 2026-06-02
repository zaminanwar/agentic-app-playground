# =============================================================================
# backend.tf (prod) — remote Terraform state in GCS.
#
# Per shared conventions: one tfstate bucket per env.
#   dev  -> agentic-app-tfstate-dev
#   prod -> agentic-app-tfstate-prod
#
# The bucket is created ONCE by infra/bootstrap (which starts on LOCAL state —
# see infra/bootstrap/README.md). After the bucket exists, `terraform init`
# here adopts the GCS backend.
#
# NOTE: backend blocks cannot use variables; the bucket name is a literal.
# =============================================================================

terraform {
  backend "gcs" {
    bucket = "agenticapp-zan-tfstate-prod"
    prefix = "env/prod"
  }
}
