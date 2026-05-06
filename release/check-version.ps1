param(
  [string]$Repo = "Youss/super-agent-platform",
  [switch]$Offline,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$VersionPath = Join-Path $Root "VERSION"

if (-not (Test-Path $VersionPath)) { throw "VERSION file not found." }
$LocalVersion = (Get-Content -Raw -LiteralPath $VersionPath).Trim().TrimStart("v")

$Status = "OFFLINE"
$LatestVersion = $null
$LatestTag = $null

if (-not $Offline) {
  $Uri = "https://api.github.com/repos/$Repo/releases/latest"
  $Headers = @{
    "User-Agent" = "super-agent-platform-check-version"
    "Accept" = "application/vnd.github+json"
  }

  $Latest = Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get
  $LatestTag = [string]$Latest.tag_name
  $LatestVersion = $LatestTag.Trim().TrimStart("v")

  if ($LatestVersion -eq $LocalVersion) {
    $Status = "UP_TO_DATE"
  } else {
    $Status = "UPDATE_AVAILABLE"
  }
}

$Result = [ordered]@{
  status = $Status
  localVersion = $LocalVersion
  latestVersion = $LatestVersion
  latestTag = $LatestTag
  repo = $Repo
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
}

if ($Json) {
  $Result | ConvertTo-Json -Depth 5
} else {
  Write-Host "Status: $($Result.status)"
  Write-Host "Local version: $($Result.localVersion)"
  if ($Result.latestTag) { Write-Host "Latest release: $($Result.latestTag)" }
}
