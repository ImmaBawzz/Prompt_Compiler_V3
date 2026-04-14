param(
    [string]$Repo = "ImmaBawzz/Prompt_Compiler_V3",
    [string]$VscePat,
    [string]$NpmToken,
    [string]$ReleaseWebhookUrl,
    [string]$RailwayToken
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not available in PATH."
    }
}

function Resolve-SecretValue([string]$Explicit, [string]$EnvName, [string]$PromptLabel) {
    if ($Explicit -and $Explicit.Trim().Length -gt 0) {
        return $Explicit.Trim()
    }

    $envValue = [Environment]::GetEnvironmentVariable($EnvName)
    if ($envValue -and $envValue.Trim().Length -gt 0) {
        return $envValue.Trim()
    }

    $secure = Read-Host -Prompt "$PromptLabel (input hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        if (-not $plain -or $plain.Trim().Length -eq 0) {
            throw "$PromptLabel cannot be empty."
        }
        return $plain.Trim()
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

Require-Command "gh"

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run: gh auth login"
}

$resolvedVsce = Resolve-SecretValue -Explicit $VscePat -EnvName "VSCE_PAT" -PromptLabel "VSCE_PAT"
$resolvedNpm = Resolve-SecretValue -Explicit $NpmToken -EnvName "NPM_TOKEN" -PromptLabel "NPM_TOKEN"
$resolvedWebhook = Resolve-SecretValue -Explicit $ReleaseWebhookUrl -EnvName "RELEASE_WEBHOOK_URL" -PromptLabel "RELEASE_WEBHOOK_URL"
$resolvedRailway = Resolve-SecretValue -Explicit $RailwayToken -EnvName "RAILWAY_TOKEN" -PromptLabel "RAILWAY_TOKEN"

$resolvedVsce | gh secret set VSCE_PAT --repo $Repo
if ($LASTEXITCODE -ne 0) {
    throw "Failed to set VSCE_PAT for repository $Repo"
}

$resolvedNpm | gh secret set NPM_TOKEN --repo $Repo
if ($LASTEXITCODE -ne 0) {
    throw "Failed to set NPM_TOKEN for repository $Repo"
}

$resolvedWebhook | gh secret set RELEASE_WEBHOOK_URL --repo $Repo
if ($LASTEXITCODE -ne 0) {
    throw "Failed to set RELEASE_WEBHOOK_URL for repository $Repo"
}

$resolvedRailway | gh secret set RAILWAY_TOKEN --repo $Repo
if ($LASTEXITCODE -ne 0) {
    throw "Failed to set RAILWAY_TOKEN for repository $Repo"
}

Write-Host "Secrets configured for ${Repo}: VSCE_PAT, NPM_TOKEN, RELEASE_WEBHOOK_URL, RAILWAY_TOKEN"
