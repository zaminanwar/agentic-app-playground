<#
.SYNOPSIS
  One-time cloud bootstrap for the agentic-app: provisions the Terraform
  foundation (tfstate buckets, Workload Identity Federation, deployer SAs) and
  wires the GitHub repo's Actions variables/secrets/environments so the CD and
  infra-plan workflows can run.

.DESCRIPTION
  Run this ONCE per GCP project set, AFTER the external prerequisites exist
  (see "PREREQUISITES" below). It is safe to re-run: terraform apply is
  idempotent and `gh` set commands overwrite. It does NOT deploy the app — the
  first app deploy happens when you push to main (cd.yml runs `terraform apply`
  per env).

  PREREQUISITES (these are YOURS to create — the script checks for them):
    1. The repo is pushed to GitHub (origin = <owner>/<repo>).
    2. Two GCP projects exist with BILLING enabled: the dev and prod project ids.
    3. CLIs installed + authenticated: gcloud (ADC), terraform >= 1.9, gh (logged in).
    4. A LangGraph Platform LICENSE key on hand (you'll paste it into Secret
       Manager near the end; the self-hosted server will not start without it).

.EXAMPLE
  ./scripts/cloud-bootstrap.ps1 -GithubOwner my-org -DevProject my-app-dev -ProdProject my-app-prod
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $GithubOwner,
  [string] $GithubRepo  = "agentic-app-playground",
  [Parameter(Mandatory = $true)] [string] $DevProject,
  [Parameter(Mandatory = $true)] [string] $ProdProject,
  [string] $Region      = "us-central1",
  [string] $ProdApproverTeam = "",   # e.g. "my-org/release-approvers"; blank = set reviewers manually later
  [switch] $SkipTerraform,           # only (re)configure GitHub if the foundation already exists
  [switch] $WhatIf                   # print actions without executing
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$bootstrapDir = Join-Path $repoRoot "infra\bootstrap"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Run($cmd) {
  Write-Host "> $cmd" -ForegroundColor DarkGray
  if (-not $WhatIf) { Invoke-Expression $cmd; if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" } }
}

# --- 0. Preconditions -------------------------------------------------------
Step "Checking prerequisites"
foreach ($tool in @("gcloud", "terraform", "gh")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required tool '$tool' not found on PATH. Install it and re-run."
  }
}
# gh must be authenticated; gcloud ADC must be valid (Zscaler CA already handled
# globally via REQUESTS_CA_BUNDLE -> ca-bundle.pem).
Run "gh auth status"
Run "gcloud auth application-default print-access-token > `$null"

$repoSlug = "$GithubOwner/$GithubRepo"
Write-Host "Target repo: $repoSlug | dev=$DevProject prod=$ProdProject region=$Region"

# --- 1. Terraform foundation (local state; creates the remote state buckets) -
if (-not $SkipTerraform) {
  Step "Applying infra/bootstrap (WIF + deployer SAs + tfstate buckets)"
  Push-Location $bootstrapDir
  try {
    Run "terraform init -input=false"
    $tfVars = @(
      "-var `"github_owner=$GithubOwner`"",
      "-var `"github_repo=$GithubRepo`"",
      "-var `"dev_project_id=$DevProject`"",
      "-var `"prod_project_id=$ProdProject`"",
      "-var `"wif_project_id=$DevProject`"",
      "-var `"region=$Region`""
    ) -join " "
    Run "terraform apply -input=false -auto-approve $tfVars"

    Step "Capturing bootstrap outputs"
    if (-not $WhatIf) {
      $script:WifProvider   = (terraform output -raw workload_identity_provider).Trim()
      $script:DevDeployerSa = (terraform output -raw deployer_service_account_dev).Trim()
      $script:ProdDeployerSa= (terraform output -raw deployer_service_account_prod).Trim()
      Write-Host "WIF_PROVIDER      = $WifProvider"
      Write-Host "DEV_DEPLOYER_SA   = $DevDeployerSa"
      Write-Host "PROD_DEPLOYER_SA  = $ProdDeployerSa"
    }
  } finally { Pop-Location }
} else {
  Step "Reading existing bootstrap outputs (-SkipTerraform)"
  Push-Location $bootstrapDir
  try {
    $script:WifProvider    = (terraform output -raw workload_identity_provider).Trim()
    $script:DevDeployerSa  = (terraform output -raw deployer_service_account_dev).Trim()
    $script:ProdDeployerSa = (terraform output -raw deployer_service_account_prod).Trim()
  } finally { Pop-Location }
}

# --- 2. GitHub Actions variables (non-sensitive) ----------------------------
Step "Setting GitHub Actions repository variables"
Run "gh variable set GCP_REGION     --repo $repoSlug --body `"$Region`""
Run "gh variable set DEV_PROJECT_ID  --repo $repoSlug --body `"$DevProject`""
Run "gh variable set PROD_PROJECT_ID --repo $repoSlug --body `"$ProdProject`""

# --- 3. GitHub Actions secrets (identity) -----------------------------------
Step "Setting GitHub Actions repository secrets"
Run "gh secret set WIF_PROVIDER     --repo $repoSlug --body `"$WifProvider`""
Run "gh secret set DEV_DEPLOYER_SA  --repo $repoSlug --body `"$DevDeployerSa`""
Run "gh secret set PROD_DEPLOYER_SA --repo $repoSlug --body `"$ProdDeployerSa`""
# ci-infra.yml's plan job uses DEV_PLAN_SA. We reuse the dev deployer SA for now
# (functional; split into a read-only gh-planner@ SA later for least privilege).
Run "gh secret set DEV_PLAN_SA      --repo $repoSlug --body `"$DevDeployerSa`""

# --- 4. GitHub Environments (dev auto, prod gated) --------------------------
Step "Creating GitHub Environments (dev, prod)"
# dev: no protection rules.
Run "gh api -X PUT repos/$repoSlug/environments/dev > `$null"
# prod: deployment-branch policy + (optional) required reviewers via team.
if ($ProdApproverTeam) {
  $teamSlug = $ProdApproverTeam.Split('/')[-1]
  if (-not $WhatIf) {
    $teamId = (gh api "orgs/$GithubOwner/teams/$teamSlug" --jq ".id")
    $body = @{ reviewers = @(@{ type = "Team"; id = [int]$teamId }) } | ConvertTo-Json -Depth 5 -Compress
    $body | gh api -X PUT "repos/$repoSlug/environments/prod" --input - | Out-Null
    Write-Host "prod environment created with required reviewer team '$ProdApproverTeam'."
  }
} else {
  Run "gh api -X PUT repos/$repoSlug/environments/prod > `$null"
  Write-Host "prod environment created. ACTION: add 'Required reviewers' manually in repo Settings -> Environments -> prod." -ForegroundColor Yellow
}

# --- 5. Manual follow-ups ----------------------------------------------------
Step "Done. Remaining MANUAL steps before the first deploy"
Write-Host @"
1. LICENSE secret (per project) — the self-hosted LangGraph server will not boot
   without it. Create the version in BOTH projects (Terraform creates the empty
   secret 'langgraph-cloud-license-key'; you supply the value):
     gcloud secrets versions add langgraph-cloud-license-key --project=$DevProject  --data-file=- <<< "<LICENSE_KEY>"
     gcloud secrets versions add langgraph-cloud-license-key --project=$ProdProject --data-file=- <<< "<LICENSE_KEY>"

2. Branch protection — require the CI checks as documented in docs/branch-protection.md
   (job names: 'agent lint, format, typecheck, test', 'ui lint, format, typecheck, build', infra-plan).

3. Replace remaining placeholders — .github/CODEOWNERS team handles (see docs/first-deploy-checklist.md).

4. First deploy — push to main. cd.yml builds the images and runs 'terraform apply'
   against infra/envs/dev (auto) then infra/envs/prod (after the prod approval).
   The first 'terraform apply' creates Cloud SQL + Memorystore + VPC + Cloud Run.
"@ -ForegroundColor Green
