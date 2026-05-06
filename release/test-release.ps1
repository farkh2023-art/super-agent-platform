param(
  [Parameter(Mandatory=$true)]
  [string]$ZipPath,
  [switch]$KeepTemp,
  [int]$TimeoutSec = 60,
  [switch]$Json,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$Started = $false
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedZip = Resolve-Path $ZipPath -ErrorAction Stop
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TempRoot = Join-Path $env:TEMP "super-agent-platform-release-test"
$TestRoot = Join-Path $TempRoot $Stamp
$Warnings = [System.Collections.Generic.List[string]]::new()
$Errors = [System.Collections.Generic.List[string]]::new()
$Steps = [System.Collections.Generic.List[object]]::new()
$Port = Get-Random -Minimum 3100 -Maximum 3999
$BaseUrl = "http://localhost:$Port"
$OriginalNpmIgnoreScripts = $env:npm_config_ignore_scripts
$OriginalNpmOffline = $env:NPM_CONFIG_OFFLINE
$OriginalNpmPreferOffline = $env:npm_config_prefer_offline

function Add-Step($Name, $Status, $Detail = $null) {
  $Steps.Add([ordered]@{ name = $Name; status = $Status; detail = $Detail; at = (Get-Date).ToUniversalTime().ToString("o") })
}

function Normalize($Value) { return ($Value -replace '\\','/').TrimStart('/') }

function Test-ForbiddenEntry($Entry) {
  $rel = Normalize $Entry
  $leaf = Split-Path $rel -Leaf
  $rules = @(
    ".env", "node_modules/", "backend/node_modules/", "backend/data/", "backend/data-test*/",
    "backend/migration-backups/", "dist/", "*.sqlite", "*.sqlite-wal", "*.sqlite-shm",
    "auth.sqlite", "storage-runtime.json", "auth-runtime.json", "*.db", "*.bak",
    "*_secret*", "*_key*", ".claude/settings.local.json", "github_pat*.txt",
    "*github_pat*", "*tokens*.txt", "*.pem", "*.key"
  )
  foreach ($rule in $rules) {
    $p = Normalize $rule
    if ($p.EndsWith("/")) {
      if ($rel.StartsWith($p, [StringComparison]::OrdinalIgnoreCase)) { return $rule }
    } elseif ($rel -like $p -or $leaf -like $p) {
      return $rule
    }
  }
  return $null
}

function Invoke-Checked($Name, [scriptblock]$Script) {
  try {
    & $Script
    Add-Step $Name "OK"
    return $true
  } catch {
    $Errors.Add("$Name failed: $($_.Exception.Message)")
    Add-Step $Name "ERROR" $_.Exception.Message
    return $false
  }
}

try {
  if (-not (Test-Path $TempRoot)) { New-Item -ItemType Directory -Path $TempRoot | Out-Null }
  New-Item -ItemType Directory -Path $TestRoot | Out-Null

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($ResolvedZip.Path)
  try {
    $zipForbidden = @()
    foreach ($entry in $archive.Entries) {
      $match = Test-ForbiddenEntry $entry.FullName
      if ($match) { $zipForbidden += [ordered]@{ file = (Normalize $entry.FullName); rule = $match } }
    }
    if ($zipForbidden.Count -gt 0) {
      foreach ($m in $zipForbidden) { $Errors.Add("Forbidden ZIP entry matched $($m.rule): $($m.file)") }
      Add-Step "zip-exclusions" "ERROR" $zipForbidden
    } else {
      Add-Step "zip-exclusions" "OK"
    }
  } finally {
    $archive.Dispose()
  }

  if ($Errors.Count -eq 0) {
    Expand-Archive -LiteralPath $ResolvedZip.Path -DestinationPath $TestRoot -Force
    Add-Step "extract" "OK" $TestRoot
  }

  $required = @("backend\package.json", "backend\src", "frontend", "release", "docs", ".env.example", "SECURITY.md")
  foreach ($item in $required) {
    $path = Join-Path $TestRoot $item
    if (-not (Test-Path $path)) { $Errors.Add("Missing extracted item: $item") }
  }
  Add-Step "structure" $(if ($Errors.Count -eq 0) { "OK" } else { "ERROR" })

  if ($Errors.Count -eq 0) {
    Push-Location $TestRoot
    try {
      $env:npm_config_ignore_scripts = "true"
      $env:npm_config_prefer_offline = "false"
      Remove-Item Env:\NPM_CONFIG_OFFLINE -ErrorAction SilentlyContinue
      Invoke-Checked "install" { & ".\release\install.ps1" | Out-Host } | Out-Null

      if (-not $NoStart -and $Errors.Count -eq 0) {
        $env:PORT = "$Port"
        Invoke-Checked "start-demo" { & ".\release\start.ps1" -Mode demo -NoBrowser | Out-Host } | Out-Null
        $Started = $true

        $deadline = (Get-Date).AddSeconds($TimeoutSec)
        $healthy = $false
        do {
          Start-Sleep -Seconds 2
          try {
            $response = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 5
            if ($response) { $healthy = $true; break }
          } catch {}
        } while ((Get-Date) -lt $deadline)

        if ($healthy) { Add-Step "wait-health" "OK" $BaseUrl }
        else {
          $Errors.Add("Server did not become healthy before timeout on $BaseUrl")
          Add-Step "wait-health" "ERROR" $BaseUrl
        }

        Invoke-Checked "health-check" { & ".\release\health-check.ps1" -BaseUrl $BaseUrl -Json | Out-Host } | Out-Null
      }
    } finally {
      if ($Started) {
        try { & ".\release\stop.ps1" | Out-Host } catch { $Warnings.Add("Stop failed: $($_.Exception.Message)") }
      }
      Remove-Item Env:\PORT -ErrorAction SilentlyContinue
      if ($OriginalNpmIgnoreScripts) { $env:npm_config_ignore_scripts = $OriginalNpmIgnoreScripts } else { Remove-Item Env:\npm_config_ignore_scripts -ErrorAction SilentlyContinue }
      if ($OriginalNpmOffline) { $env:NPM_CONFIG_OFFLINE = $OriginalNpmOffline } else { Remove-Item Env:\NPM_CONFIG_OFFLINE -ErrorAction SilentlyContinue }
      if ($OriginalNpmPreferOffline) { $env:npm_config_prefer_offline = $OriginalNpmPreferOffline } else { Remove-Item Env:\npm_config_prefer_offline -ErrorAction SilentlyContinue }
      Pop-Location
    }
  }
} finally {
  if (-not $KeepTemp -and (Test-Path $TestRoot)) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$Status = if ($Errors.Count -gt 0) { "FAIL" } else { "PASS" }
$Report = [ordered]@{
  status = $Status
  zipPath = $ResolvedZip.Path
  testedAt = (Get-Date).ToUniversalTime().ToString("o")
  tempRoot = $TestRoot
  keptTemp = [bool]$KeepTemp
  noStart = [bool]$NoStart
  baseUrl = $BaseUrl
  steps = @($Steps)
  warnings = @($Warnings)
  errors = @($Errors)
}

if ($Json) { $Report | ConvertTo-Json -Depth 8 }
else {
  $color = if ($Status -eq "PASS") { "Green" } else { "Red" }
  Write-Host "Release extraction test: $Status" -ForegroundColor $color
  Write-Host "ZIP: $($ResolvedZip.Path)"
  Write-Host "Temp: $TestRoot"
}

if ($Errors.Count -gt 0) { exit 1 }
