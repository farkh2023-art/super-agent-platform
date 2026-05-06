param(
  [string]$Version = "",
  [switch]$DryRun,
  [switch]$Offline,
  [switch]$Json,
  [switch]$Strict,
  [switch]$SkipTests,
  [switch]$SkipDocs,
  [switch]$SkipReleaseBuild
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$VersionPath = Join-Path $Root "VERSION"
$PackagePath = Join-Path $Root "backend\package.json"
$Checks = [System.Collections.Generic.List[object]]::new()
$Warnings = [System.Collections.Generic.List[string]]::new()
$Errors = [System.Collections.Generic.List[string]]::new()

function Normalize-Rel($Value) {
  return ($Value -replace '\\','/').TrimStart('/')
}

function Add-Check($Name, $Status, $Detail = "") {
  $Checks.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  })
  if ($Status -eq "ERROR") { $Errors.Add("${Name}: ${Detail}") }
  if ($Status -eq "WARNING") { $Warnings.Add("${Name}: ${Detail}") }
}

function Test-RequiredFile($Name, $RelativePath) {
  $path = Join-Path $Root $RelativePath
  if (Test-Path $path) {
    Add-Check $Name "OK" (Normalize-Rel $RelativePath)
  } else {
    Add-Check $Name "ERROR" "Missing $(Normalize-Rel $RelativePath)"
  }
}

function Invoke-GateStep($Name, [string]$Command, [scriptblock]$Script) {
  if ($DryRun) {
    Add-Check $Name "DRY_RUN" $Command
    Write-Host "[DRY-RUN] $Command"
    return
  }

  try {
    & $Script
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
    Add-Check $Name "OK" $Command
  } catch {
    Add-Check $Name "ERROR" $_.Exception.Message
  }
}

if (-not (Test-Path $VersionPath)) {
  Add-Check "version-file" "ERROR" "VERSION missing"
} else {
  $LocalVersion = (Get-Content -Raw -LiteralPath $VersionPath).Trim()
  if (-not $Version) { $Version = $LocalVersion }
  $Version = $Version.Trim().TrimStart("v")
  Add-Check "version-file" "OK" "VERSION present"
}

if (-not $Version) { $Version = "unknown" }

if (Test-Path $PackagePath) {
  try {
    $PackageVersion = [string]((Get-Content -Raw -LiteralPath $PackagePath | ConvertFrom-Json).version)
    $BaseVersion = ($Version -replace '-.*$', '')
    if ($PackageVersion -eq $BaseVersion) {
      Add-Check "package-version" "OK" "backend/package.json matches $BaseVersion"
    } else {
      Add-Check "package-version" "ERROR" "backend/package.json is $PackageVersion, expected $BaseVersion"
    }
  } catch {
    Add-Check "package-version" "ERROR" "backend/package.json could not be parsed"
  }
} else {
  Add-Check "package-version" "ERROR" "backend/package.json missing"
}

Test-RequiredFile "version-endpoint-source" "backend/src/server.js"
Test-RequiredFile "phase9-doc" "docs/PHASE9.md"
Test-RequiredFile "docs-route" "backend/src/routes/docs.js"
Test-RequiredFile "docs-manifest" "backend/src/docs/docsManifest.js"
Test-RequiredFile "frontend-docs-app" "frontend/js/app.js"
Test-RequiredFile "frontend-docs-api" "frontend/js/api.js"
Test-RequiredFile "frontend-docs-index" "frontend/index.html"
Test-RequiredFile "verify-release-script" "release/verify-release.ps1"
Test-RequiredFile "sign-release-script" "release/sign-release.ps1"

$serverContent = if (Test-Path (Join-Path $Root "backend/src/server.js")) { Get-Content -Raw -LiteralPath (Join-Path $Root "backend/src/server.js") } else { "" }
if ($serverContent -match '/api/version') {
  Add-Check "api-version-documented" "OK" "/api/version source present"
} elseif (Test-Path $VersionPath) {
  Add-Check "api-version-documented" "WARNING" "VERSION exists but /api/version source marker was not found"
} else {
  Add-Check "api-version-documented" "ERROR" "/api/version marker and VERSION missing"
}

$appContent = if (Test-Path (Join-Path $Root "frontend/js/app.js")) { Get-Content -Raw -LiteralPath (Join-Path $Root "frontend/js/app.js") } else { "" }
$apiContent = if (Test-Path (Join-Path $Root "frontend/js/api.js")) { Get-Content -Raw -LiteralPath (Join-Path $Root "frontend/js/api.js") } else { "" }
$indexContent = if (Test-Path (Join-Path $Root "frontend/index.html")) { Get-Content -Raw -LiteralPath (Join-Path $Root "frontend/index.html") } else { "" }
if ($appContent -match 'loadDocsView' -and $appContent -match 'loadDocContent' -and $apiContent -match 'getDocs' -and $apiContent -match 'getDoc' -and $indexContent -match 'view-docs|docs-view|Documentation') {
  Add-Check "documentation-center-frontend" "OK" "Documentation Center frontend markers present"
} else {
  Add-Check "documentation-center-frontend" "ERROR" "Documentation Center frontend markers missing"
}

$ForbiddenPatterns = @(
  ".env",
  "github_pat*.txt",
  "*tokens*.txt",
  "*.sqlite",
  "backend/data/"
)

foreach ($pattern in $ForbiddenPatterns) {
  $matches = @(Get-ChildItem -Path $Root -Recurse -Force -ErrorAction SilentlyContinue -Filter $pattern |
    Where-Object {
      $rel = Normalize-Rel ($_.FullName.Substring($Root.Path.Length).TrimStart('\','/'))
      -not $rel.StartsWith("backend/node_modules/", [StringComparison]::OrdinalIgnoreCase) -and
      -not $rel.StartsWith("node_modules/", [StringComparison]::OrdinalIgnoreCase) -and
      -not $rel.StartsWith("dist/", [StringComparison]::OrdinalIgnoreCase)
    })
  if ($matches.Count -gt 0) {
    Add-Check "forbidden-$pattern" "WARNING" "$($matches.Count) matching local file(s) present"
  } else {
    Add-Check "forbidden-$pattern" "OK" "No matching local files"
  }
}

if (-not $SkipDocs) {
  Invoke-GateStep "generate-docs" ".\release\generate-docs.ps1 -Json" {
    & (Join-Path $PSScriptRoot "generate-docs.ps1") -Json
  }
} else {
  Add-Check "generate-docs" "SKIPPED" "SkipDocs enabled"
}

if (-not $SkipTests) {
  Invoke-GateStep "local-ci" ".\release\local-ci.ps1 -Version v$Version -Strict" {
    & (Join-Path $PSScriptRoot "local-ci.ps1") -Version "v$Version" -Strict
  }
} else {
  Add-Check "local-ci" "SKIPPED" "SkipTests enabled"
}

if (-not $SkipReleaseBuild) {
  Invoke-GateStep "create-release" ".\release\create-release.ps1 -Version v$Version -Verify -Strict" {
    & (Join-Path $PSScriptRoot "create-release.ps1") -Version "v$Version" -Verify -Strict
  }
} else {
  Add-Check "create-release" "SKIPPED" "SkipReleaseBuild enabled"
}

if ($Offline) {
  Add-Check "network" "SKIPPED" "Offline mode enabled; GitHub and Internet checks skipped"
} else {
  Add-Check "network" "OK" "No network check required for local gate"
}

$criticalErrors = @($Checks | Where-Object { $_.status -eq "ERROR" })
$status = if ($criticalErrors.Count -gt 0) { "FAIL" } else { "PASS" }

$result = [ordered]@{
  status = $status
  version = $Version
  dryRun = [bool]$DryRun
  offline = [bool]$Offline
  strict = [bool]$Strict
  checks = @($Checks)
  warnings = @($Warnings)
  errors = @($Errors)
}

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Host "Public release check: $status"
  Write-Host "Version: $Version"
  foreach ($check in $Checks) {
    Write-Host "- $($check.name): $($check.status)"
  }
  foreach ($warning in $Warnings) { Write-Warning $warning }
}

if ($Strict -and $criticalErrors.Count -gt 0) { exit 1 }

