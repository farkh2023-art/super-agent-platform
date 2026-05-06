param(
  [string]$ZipUrl,
  [string]$Sha256,
  [string]$Version,
  [string]$DownloadDir = 'dist/update-downloads',
  [string]$InstallDir,
  [switch]$DryRun,
  [switch]$Offline,
  [switch]$Json,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function New-Result {
  param(
    [string]$Status,
    [string]$Version = $null,
    [string]$ZipPath = $null,
    [string]$InstallDir = $null,
    [string[]]$Steps = @(),
    [string]$Message = $null
  )

  $result = [ordered]@{
    status = $Status
    version = $Version
    zipPath = $ZipPath
    installDir = $InstallDir
    dryRun = [bool]$DryRun
    steps = $Steps
  }

  if ($Message) {
    $result.message = $Message
  }

  return [pscustomobject]$result
}

function Write-Result {
  param([object]$Result)

  if ($Json) {
    $Result | ConvertTo-Json -Depth 8
    return
  }

  Write-Output ("status: {0}" -f $Result.status)
  if ($Result.version) { Write-Output ("version: {0}" -f $Result.version) }
  if ($Result.zipPath) { Write-Output ("zipPath: {0}" -f $Result.zipPath) }
  if ($Result.installDir) { Write-Output ("installDir: {0}" -f $Result.installDir) }
  foreach ($step in $Result.steps) { Write-Output ("step: {0}" -f $step) }
  if ($Result.message) { Write-Output ("message: {0}" -f $Result.message) }
}

function Resolve-RepoPath {
  param([string]$PathValue)

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }

  $repoRoot = Split-Path -Parent $PSScriptRoot
  return Join-Path $repoRoot $PathValue
}

function Add-HistoryEntry {
  param(
    [string]$InstalledVersion,
    [string]$PackagePath,
    [string]$TargetDir,
    [string]$Hash
  )

  $repoRoot = Split-Path -Parent $PSScriptRoot
  $dataDir = Join-Path $repoRoot 'data'
  $historyPath = Join-Path $dataDir 'update-history.json'

  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  }

  $history = @()
  if (Test-Path -LiteralPath $historyPath) {
    $raw = (Get-Content -LiteralPath $historyPath -Raw).Trim()
    if ($raw) {
      $parsed = $raw | ConvertFrom-Json
      if ($parsed -is [array]) {
        $history = @($parsed)
      } elseif ($parsed.history) {
        $history = @($parsed.history)
      } else {
        $history = @($parsed)
      }
    }
  }

  $history += [pscustomobject]@{
    version = $InstalledVersion
    installedAt = (Get-Date).ToUniversalTime().ToString('o')
    zipPath = $PackagePath
    installDir = $TargetDir
    sha256 = $Hash.ToLowerInvariant()
    source = 'update-install.ps1'
  }

  [pscustomobject]@{ history = $history } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $historyPath -Encoding UTF8
}

try {
  $steps = @()

  if ($Offline) {
    $steps += 'Offline mode: no network access will be attempted.'
    Write-Result (New-Result -Status 'OFFLINE' -Version $Version -Steps $steps -Message 'Offline mode enabled.')
    exit 0
  }

  if (-not $ZipUrl) {
    $steps += 'No ZipUrl provided; nothing will be downloaded.'
    Write-Result (New-Result -Status 'NO_PACKAGE' -Version $Version -Steps $steps -Message 'Provide ZipUrl, Sha256, Version, InstallDir, and Force for a real install.')
    exit 0
  }

  $zipUri = [System.Uri]$ZipUrl
  if ($zipUri.Scheme -ne 'https') {
    throw 'ZipUrl must use HTTPS.'
  }

  if (-not $Sha256 -or $Sha256 -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Sha256 must be a 64 character hex digest.'
  }

  if (-not $Version) {
    throw 'Version is required.'
  }

  $resolvedDownloadDir = Resolve-RepoPath -PathValue $DownloadDir
  $zipFileName = if ($zipUri.Segments.Length -gt 0) { $zipUri.Segments[$zipUri.Segments.Length - 1] } else { '' }
  if (-not $zipFileName -or -not $zipFileName.EndsWith('.zip', [System.StringComparison]::OrdinalIgnoreCase)) {
    $zipFileName = "update-$Version.zip"
  }
  $zipPath = Join-Path $resolvedDownloadDir $zipFileName

  $steps += "Create download directory: $resolvedDownloadDir"
  $steps += "Download ZIP package from HTTPS URL to: $zipPath"
  $steps += 'Verify SHA256 with Get-FileHash before extraction.'

  if ($InstallDir) {
    $resolvedInstallDir = Resolve-RepoPath -PathValue $InstallDir
    $steps += "Extract verified ZIP into explicit install directory: $resolvedInstallDir"
    $steps += 'Record success in data/update-history.json after extraction.'
  } else {
    $resolvedInstallDir = $null
    $steps += 'No InstallDir provided; package would be downloaded and verified only.'
  }

  if ($DryRun) {
    Write-Result (New-Result -Status 'DRY_RUN' -Version $Version -ZipPath $zipPath -InstallDir $resolvedInstallDir -Steps $steps -Message 'DryRun only; no download, extraction, service stop, or file replacement occurred.')
    exit 0
  }

  if (-not $Force) {
    Write-Result (New-Result -Status 'CONFIRMATION_REQUIRED' -Version $Version -ZipPath $zipPath -InstallDir $resolvedInstallDir -Steps $steps -Message 'Force is required before downloading or changing files.')
    exit 1
  }

  if (-not $InstallDir) {
    throw 'InstallDir is required for a real install.'
  }

  New-Item -ItemType Directory -Path $resolvedDownloadDir -Force | Out-Null
  Invoke-WebRequest -Uri $zipUri.AbsoluteUri -OutFile $zipPath -UseBasicParsing -TimeoutSec 60

  $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
  if ($actualHash.ToLowerInvariant() -ne $Sha256.ToLowerInvariant()) {
    throw 'SHA256 verification failed; archive will not be extracted.'
  }

  if (-not (Test-Path -LiteralPath $resolvedInstallDir)) {
    New-Item -ItemType Directory -Path $resolvedInstallDir -Force | Out-Null
  }

  Expand-Archive -LiteralPath $zipPath -DestinationPath $resolvedInstallDir -Force
  Add-HistoryEntry -InstalledVersion $Version -PackagePath $zipPath -TargetDir $resolvedInstallDir -Hash $actualHash

  $steps += 'Verified archive extracted successfully.'
  Write-Result (New-Result -Status 'OK' -Version $Version -ZipPath $zipPath -InstallDir $resolvedInstallDir -Steps $steps -Message 'Update installed from a verified archive.')
  exit 0
} catch {
  Write-Result (New-Result -Status 'ERROR' -Version $Version -Steps @($_.Exception.Message) -Message $_.Exception.Message)
  exit 1
}
