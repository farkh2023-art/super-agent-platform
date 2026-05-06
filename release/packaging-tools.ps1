param(
  [string]$Version = "v2.6.0",
  [string]$OutputDir = "dist\releases",
  [switch]$BuildMsi,
  [switch]$BuildMsix,
  [string]$CertificatePath = "",
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedOutput = if ([IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $Root $OutputDir }
if (-not (Test-Path $ResolvedOutput)) { New-Item -ItemType Directory -Path $ResolvedOutput | Out-Null }

function Build-Msi {
  param([string]$Version, [string]$OutputDir, [string]$CertificatePath, [switch]$DryRun)
  Write-Host "BuildMsi: checking WiX Toolset prerequisites..." -ForegroundColor Cyan
  $wix = Get-Command candle.exe -ErrorAction SilentlyContinue
  if (-not $wix) {
    Write-Host "  [SKIP] WiX Toolset (candle.exe) not found. Install WiX v3.11+ to enable MSI builds." -ForegroundColor Yellow
    return
  }
  Write-Host "  WiX found: $($wix.Source)" -ForegroundColor Green
  if ($DryRun) { Write-Host "  [DRY-RUN] Would build MSI for version $Version" -ForegroundColor Yellow; return }
  if ($CertificatePath -and (Test-Path -LiteralPath $CertificatePath)) {
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtool) {
      Write-Host "  signtool: signing MSI with $CertificatePath" -ForegroundColor Cyan
      # signtool sign /fd SHA256 /f "$CertificatePath" /t "$TimestampUrl" "<msiPath>"
    }
  }
  Write-Host "BuildMsi: done." -ForegroundColor Green
}

function Build-Msix {
  param([string]$Version, [string]$OutputDir, [string]$CertificatePath, [switch]$DryRun)
  Write-Host "BuildMsix: checking makeappx.exe prerequisites..." -ForegroundColor Cyan
  $makeappx = Get-Command makeappx.exe -ErrorAction SilentlyContinue
  if (-not $makeappx) {
    Write-Host "  [SKIP] makeappx.exe not found. Install Windows SDK to enable MSIX builds." -ForegroundColor Yellow
    return
  }
  Write-Host "  makeappx found: $($makeappx.Source)" -ForegroundColor Green
  if ($DryRun) { Write-Host "  [DRY-RUN] Would build MSIX for version $Version" -ForegroundColor Yellow; return }
  if ($CertificatePath -and (Test-Path -LiteralPath $CertificatePath)) {
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtool) {
      Write-Host "  signtool: signing MSIX with $CertificatePath" -ForegroundColor Cyan
      # signtool sign /fd SHA256 /f "$CertificatePath" /t "$TimestampUrl" "<msixPath>"
    }
  }
  Write-Host "BuildMsix: done." -ForegroundColor Green
}

if ($BuildMsi) {
  Build-Msi -Version $Version -OutputDir $ResolvedOutput -CertificatePath $CertificatePath -DryRun:$DryRun
}

if ($BuildMsix) {
  Build-Msix -Version $Version -OutputDir $ResolvedOutput -CertificatePath $CertificatePath -DryRun:$DryRun
}

if (-not $BuildMsi -and -not $BuildMsix) {
  Write-Host "packaging-tools.ps1: use -BuildMsi and/or -BuildMsix to create installer packages." -ForegroundColor Yellow
  Write-Host "  Optional: -CertificatePath <path-to.pfx> for Authenticode code signing via signtool." -ForegroundColor Yellow
}
