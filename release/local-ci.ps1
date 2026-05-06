param(
  [string]$Version = "v2.6.0-phase-8d",
  [switch]$SkipTests,
  [switch]$SkipReleaseBuild,
  [switch]$KeepTemp,
  [switch]$Json,
  [switch]$Strict,
  [switch]$BuildMsi,
  [switch]$BuildMsix,
  [string]$CertificatePath = ""
)

$ErrorActionPreference = "Stop"
$StartedAt = Get-Date
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $Root "dist\releases"
$SafeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
$ZipPath = Join-Path $OutputDir "super-agent-platform-$SafeVersion.zip"
$ReportJson = Join-Path $OutputDir "LOCAL_CI_REPORT.json"
$ReportMd = Join-Path $OutputDir "LOCAL_CI_REPORT.md"
$Steps = [System.Collections.Generic.List[object]]::new()
$Warnings = [System.Collections.Generic.List[string]]::new()
$Errors = [System.Collections.Generic.List[string]]::new()

function Add-Step($Name, $Status, $Detail = $null, $Seconds = $null) {
  $Steps.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
    seconds = $Seconds
    at = (Get-Date).ToUniversalTime().ToString("o")
  })
}

function Invoke-Step($Name, [scriptblock]$Script) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    & $Script
    $sw.Stop()
    Add-Step $Name "OK" $null ([math]::Round($sw.Elapsed.TotalSeconds, 2))
    return $true
  } catch {
    $sw.Stop()
    $Errors.Add("$Name failed: $($_.Exception.Message)")
    Add-Step $Name "ERROR" $_.Exception.Message ([math]::Round($sw.Elapsed.TotalSeconds, 2))
    return $false
  }
}

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

$commit = "unknown"
$tag = $null
try { $commit = (git -c safe.directory="$($Root.Path.Replace('\','/'))" rev-parse HEAD 2>$null) } catch {}
try { $tag = (git -c safe.directory="$($Root.Path.Replace('\','/'))" describe --tags --exact-match 2>$null) } catch {}

Invoke-Step "git-working-tree" {
  $status = @(git -c safe.directory="$($Root.Path.Replace('\','/'))" status --short 2>$null)
  if ($status.Count -gt 0) {
    $Warnings.Add("Git working tree is not clean: $($status.Count) changed entries.")
  }
} | Out-Null

Invoke-Step "node-npm" {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node is missing" }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is missing" }
  node --version | Out-Null
  npm --version | Out-Null
} | Out-Null

if (-not $SkipTests -and $Errors.Count -eq 0) {
  Invoke-Step "backend-tests" {
    Push-Location (Join-Path $Root "backend")
    try {
      & node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tests/ --runInBand
      if ($LASTEXITCODE -ne 0) { throw "Jest failed with exit code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  } | Out-Null
} elseif ($SkipTests) {
  Add-Step "backend-tests" "SKIPPED" "SkipTests enabled"
}

if (-not $SkipReleaseBuild -and $Errors.Count -eq 0) {
  Invoke-Step "release-dry-run" {
    & (Join-Path $PSScriptRoot "create-release.ps1") -Version $Version -DryRun
    if ($LASTEXITCODE -ne 0) { throw "create-release dry-run failed with exit code $LASTEXITCODE" }
  } | Out-Null

  if ($Errors.Count -eq 0) {
    Invoke-Step "release-build" {
      & (Join-Path $PSScriptRoot "create-release.ps1") -Version $Version
      if ($LASTEXITCODE -ne 0) { throw "create-release failed with exit code $LASTEXITCODE" }
    } | Out-Null
  }
} elseif ($SkipReleaseBuild) {
  Add-Step "release-build" "SKIPPED" "SkipReleaseBuild enabled"
}

if ($Errors.Count -eq 0) {
  Invoke-Step "verify-release" {
    & (Join-Path $PSScriptRoot "verify-release.ps1") -ZipPath $ZipPath -Strict:$Strict
    if ($LASTEXITCODE -ne 0) { throw "verify-release failed with exit code $LASTEXITCODE" }
  } | Out-Null
}

if ($Errors.Count -eq 0) {
  Invoke-Step "sign-release" {
    & (Join-Path $PSScriptRoot "sign-release.ps1") -ZipPath $ZipPath -Version $Version
    if ($LASTEXITCODE -ne 0) { throw "sign-release failed with exit code $LASTEXITCODE" }
  } | Out-Null
}

if ($Errors.Count -eq 0) {
  Invoke-Step "test-release" {
    & (Join-Path $PSScriptRoot "test-release.ps1") -ZipPath $ZipPath -KeepTemp:$KeepTemp -Json | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "test-release failed with exit code $LASTEXITCODE" }
  } | Out-Null
}

if ($Errors.Count -eq 0 -and ($BuildMsi -or $BuildMsix)) {
  Invoke-Step "packaging-msi-msix" {
    & (Join-Path $PSScriptRoot "packaging-tools.ps1") `
      -Version $Version -OutputDir $OutputDir `
      -BuildMsi:$BuildMsi -BuildMsix:$BuildMsix `
      -CertificatePath $CertificatePath
    if ($LASTEXITCODE -ne 0) { throw "packaging-tools failed with exit code $LASTEXITCODE" }
  } | Out-Null
}

$duration = [math]::Round(((Get-Date) - $StartedAt).TotalSeconds, 2)
$conclusion = if ($Errors.Count -gt 0) { "FAIL" } else { "PASS" }
$Report = [ordered]@{
  conclusion = $conclusion
  version = $Version
  date = (Get-Date).ToUniversalTime().ToString("o")
  commit = $commit
  tag = $tag
  testsStatus = (($Steps | Where-Object { $_.name -eq "backend-tests" } | Select-Object -First 1).status)
  releaseBuildStatus = (($Steps | Where-Object { $_.name -eq "release-build" } | Select-Object -First 1).status)
  verifyStatus = (($Steps | Where-Object { $_.name -eq "verify-release" } | Select-Object -First 1).status)
  signatureStatus = (($Steps | Where-Object { $_.name -eq "sign-release" } | Select-Object -First 1).status)
  extractionTestStatus = (($Steps | Where-Object { $_.name -eq "test-release" } | Select-Object -First 1).status)
  healthCheckStatus = (($Steps | Where-Object { $_.name -eq "test-release" } | Select-Object -First 1).status)
  sensitiveExclusions = "checked by verify-release and test-release"
  durationSeconds = $duration
  zipPath = $ZipPath
  steps = @($Steps)
  warnings = @($Warnings)
  errors = @($Errors)
}

$Report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportJson -Encoding UTF8

$md = @()
$md += "# Local CI Report"
$md += ""
$md += "- Conclusion: $conclusion"
$md += "- Version: $Version"
$md += "- Commit: $commit"
$md += "- Tag: $tag"
$md += "- ZIP: $ZipPath"
$md += "- Duration: $duration seconds"
$md += ""
$md += "## Steps"
foreach ($step in $Steps) {
  $line = "- $($step.name): $($step.status)"
  if ($step.seconds -ne $null) { $line += " ($($step.seconds)s)" }
  if ($step.detail) { $line += " - $($step.detail)" }
  $md += $line
}
$md += ""
$md += "## Warnings"
if ($Warnings.Count) { foreach ($w in $Warnings) { $md += "- $w" } } else { $md += "- None" }
$md += ""
$md += "## Errors"
if ($Errors.Count) { foreach ($e in $Errors) { $md += "- $e" } } else { $md += "- None" }
$md | Set-Content -LiteralPath $ReportMd -Encoding UTF8

if ($Json) { $Report | ConvertTo-Json -Depth 10 }
else {
  $color = if ($conclusion -eq "PASS") { "Green" } else { "Red" }
  Write-Host "Local CI: $conclusion" -ForegroundColor $color
  Write-Host "Report JSON: $ReportJson"
  Write-Host "Report MD  : $ReportMd"
}

if ($Errors.Count -gt 0) { exit 1 }
