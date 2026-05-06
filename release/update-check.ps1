param(
  [string]$FeedUrl,
  [string]$CurrentVersion,
  [switch]$Offline,
  [switch]$Json,
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'

function New-Result {
  param(
    [string]$Status,
    [string]$CurrentVersion = $null,
    [string]$LatestVersion = $null,
    [bool]$UpdateAvailable = $false,
    [string]$DownloadUrl = $null,
    [string]$Sha256 = $null,
    [string]$Message = $null
  )

  $result = [ordered]@{
    status = $Status
    currentVersion = $CurrentVersion
    latestVersion = $LatestVersion
    updateAvailable = $UpdateAvailable
    downloadUrl = $DownloadUrl
    sha256 = $Sha256
  }

  if ($Message) {
    $result.message = $Message
  }

  return [pscustomobject]$result
}

function Write-Result {
  param([object]$Result)

  if ($Json) {
    $Result | ConvertTo-Json -Depth 6
    return
  }

  Write-Output ("status: {0}" -f $Result.status)
  Write-Output ("currentVersion: {0}" -f $Result.currentVersion)
  if ($Result.latestVersion) { Write-Output ("latestVersion: {0}" -f $Result.latestVersion) }
  Write-Output ("updateAvailable: {0}" -f $Result.updateAvailable)
  if ($Result.downloadUrl) { Write-Output ("downloadUrl: {0}" -f $Result.downloadUrl) }
  if ($Result.sha256) { Write-Output ("sha256: {0}" -f $Result.sha256) }
  if ($Result.message) { Write-Output ("message: {0}" -f $Result.message) }
}

function Read-LocalVersion {
  param([string]$Fallback)

  if ($Fallback) {
    return $Fallback.Trim()
  }

  $repoRoot = Split-Path -Parent $PSScriptRoot
  $versionFile = Join-Path $repoRoot 'VERSION'

  if (Test-Path -LiteralPath $versionFile) {
    return (Get-Content -LiteralPath $versionFile -Raw).Trim()
  }

  return '0.0.0'
}

function ConvertTo-VersionParts {
  param([string]$Version)

  $value = (($Version -as [string]) -replace '^v', '').Trim()
  $segments = $value -split '-', 2
  $core = $segments[0] -split '\.'

  return [pscustomobject]@{
    major = if ($core.Length -gt 0 -and $core[0] -match '^\d+$') { [int]$core[0] } else { 0 }
    minor = if ($core.Length -gt 1 -and $core[1] -match '^\d+$') { [int]$core[1] } else { 0 }
    patch = if ($core.Length -gt 2 -and $core[2] -match '^\d+$') { [int]$core[2] } else { 0 }
    pre = if ($segments.Length -gt 1) { $segments[1] } else { $null }
  }
}

function Compare-Semver {
  param(
    [string]$Left,
    [string]$Right
  )

  $a = ConvertTo-VersionParts $Left
  $b = ConvertTo-VersionParts $Right

  foreach ($key in @('major', 'minor', 'patch')) {
    if ($a.$key -gt $b.$key) { return 1 }
    if ($a.$key -lt $b.$key) { return -1 }
  }

  if (-not $a.pre -and $b.pre) { return 1 }
  if ($a.pre -and -not $b.pre) { return -1 }
  if ($a.pre -and $b.pre) {
    return [string]::Compare($a.pre, $b.pre, [System.StringComparison]::OrdinalIgnoreCase)
  }

  return 0
}

try {
  $current = Read-LocalVersion -Fallback $CurrentVersion

  if ($Offline) {
    Write-Result (New-Result -Status 'OFFLINE' -CurrentVersion $current -Message 'Offline mode enabled; update feed was not contacted.')
    exit 0
  }

  if (-not $FeedUrl) {
    Write-Result (New-Result -Status 'NO_FEED' -CurrentVersion $current -Message 'No update feed URL was provided.')
    exit 0
  }

  $feedUri = [System.Uri]$FeedUrl
  if ($feedUri.Scheme -ne 'https') {
    throw 'FeedUrl must use HTTPS.'
  }

  $response = Invoke-RestMethod -Uri $feedUri.AbsoluteUri -Method Get -TimeoutSec 20
  $latest = ($response.version -as [string]).Trim()
  $downloadUrl = ($response.downloadUrl -as [string]).Trim()
  $sha256 = ($response.sha256 -as [string]).Trim()

  if (-not $latest -or -not $downloadUrl -or -not $sha256) {
    throw 'Manifest must contain version, downloadUrl, and sha256.'
  }

  $downloadUri = [System.Uri]$downloadUrl
  if ($downloadUri.Scheme -ne 'https') {
    throw 'Manifest downloadUrl must use HTTPS.'
  }

  if ($sha256 -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Manifest sha256 must be a 64 character hex digest.'
  }

  $updateAvailable = (Compare-Semver -Left $latest -Right $current) -gt 0
  $status = if ($updateAvailable) { 'UPDATE_AVAILABLE' } else { 'UP_TO_DATE' }

  Write-Result (New-Result -Status $status -CurrentVersion $current -LatestVersion $latest -UpdateAvailable $updateAvailable -DownloadUrl $downloadUrl -Sha256 $sha256)
  exit 0
} catch {
  $result = New-Result -Status 'ERROR' -CurrentVersion (Read-LocalVersion -Fallback $CurrentVersion) -Message $_.Exception.Message
  Write-Result $result
  if ($Strict) { exit 1 }
  exit 0
}
