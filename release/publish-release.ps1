param(
  [string]$Version = "",
  [string]$Remote = "origin",
  [switch]$DryRun,
  [switch]$SkipCI,
  [switch]$SkipGitHubRelease
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$VersionPath = Join-Path $Root "VERSION"
$PackagePath = Join-Path $Root "backend\package.json"
$ReleaseDir = Join-Path $Root "dist\releases"

function Invoke-PublishCommand($Label, [string]$Command, [scriptblock]$Script) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] $Label" -ForegroundColor Cyan
    Write-Host "  $Command"
    return
  }

  Write-Host $Label -ForegroundColor Cyan
  & $Script
}

if (-not $Version) {
  if (-not (Test-Path $VersionPath)) { throw "VERSION file not found." }
  $Version = (Get-Content -Raw -LiteralPath $VersionPath).Trim()
}

$Version = $Version.Trim().TrimStart("v")
if (-not $Version) { throw "Version is empty." }

if (-not (Test-Path $VersionPath)) { throw "VERSION file not found." }
$LocalVersion = (Get-Content -Raw -LiteralPath $VersionPath).Trim().TrimStart("v")
if ($LocalVersion -ne $Version) {
  throw "Version mismatch. VERSION contains '$LocalVersion', requested '$Version'."
}

if (-not (Test-Path $PackagePath)) { throw "backend/package.json not found." }
$PackageVersion = [string]((Get-Content -Raw -LiteralPath $PackagePath | ConvertFrom-Json).version)
$BaseVersion = ($Version -replace '-.*$', '')
if ($PackageVersion -ne $BaseVersion) {
  throw "Version mismatch. backend/package.json contains '$PackageVersion', expected '$BaseVersion'."
}

$TagName = "v$Version"
$ZipPath = Join-Path $ReleaseDir "super-agent-platform-$TagName.zip"
$ShaPath = "$ZipPath.sha256"
$ManifestPath = Join-Path $ReleaseDir "MANIFEST.json"
$SignaturePath = Join-Path $ReleaseDir "RELEASE_SIGNATURE.json"

if (-not $SkipCI) {
  Invoke-PublishCommand "Run local CI" ".\release\local-ci.ps1 -Version $TagName -Strict" {
    & (Join-Path $PSScriptRoot "local-ci.ps1") -Version $TagName -Strict
  }
}

Invoke-PublishCommand "Create git tag" "git tag $TagName" {
  git -c safe.directory="$($Root.Path.Replace('\','/'))" tag $TagName
  if ($LASTEXITCODE -ne 0) { throw "git tag failed." }
}

Invoke-PublishCommand "Push git tag" "git push $Remote $TagName" {
  git -c safe.directory="$($Root.Path.Replace('\','/'))" push $Remote $TagName
  if ($LASTEXITCODE -ne 0) { throw "git push failed." }
}

if (-not $SkipGitHubRelease) {
  $releaseCommand = "gh release create $TagName `"$ZipPath`" `"$ShaPath`" `"$ManifestPath`" `"$SignaturePath`" --title `"$TagName`" --notes `"$TagName`""
  Invoke-PublishCommand "Create GitHub release" $releaseCommand {
    if (-not (Test-Path $ZipPath)) { throw "ZIP not found: $ZipPath" }
    if (-not (Test-Path $ShaPath)) { throw "SHA256 file not found: $ShaPath" }
    if (-not (Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }
    if (-not (Test-Path $SignaturePath)) { throw "Signature not found: $SignaturePath" }

    gh release create $TagName $ZipPath $ShaPath $ManifestPath $SignaturePath --title $TagName --notes $TagName
    if ($LASTEXITCODE -ne 0) { throw "gh release create failed." }
  }
}

Write-Host "Publish release prepared for $TagName" -ForegroundColor Green
