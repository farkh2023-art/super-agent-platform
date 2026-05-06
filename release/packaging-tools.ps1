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
  $candle = Get-Command candle.exe -ErrorAction SilentlyContinue
  $light  = Get-Command light.exe  -ErrorAction SilentlyContinue
  if (-not $candle -or -not $light) {
    Write-Host "  [SKIP] WiX Toolset (candle.exe / light.exe) not found. Install WiX v3.11+ to enable MSI builds." -ForegroundColor Yellow
    return
  }
  Write-Host "  candle.exe : $($candle.Source)" -ForegroundColor Green
  Write-Host "  light.exe  : $($light.Source)"  -ForegroundColor Green
  if ($DryRun) { Write-Host "  [DRY-RUN] Would build MSI for version $Version" -ForegroundColor Yellow; return }
  $wxsDir  = Join-Path $PSScriptRoot "wix"
  $wixObj  = Join-Path $OutputDir "product.wixobj"
  $msiPath = Join-Path $OutputDir "super-agent-platform-$Version.msi"
  & $candle.Source (Join-Path $wxsDir "product.wxs") -out $wixObj
  if ($LASTEXITCODE -ne 0) { throw "candle.exe failed with exit code $LASTEXITCODE" }
  & $light.Source $wixObj -out $msiPath
  if ($LASTEXITCODE -ne 0) { throw "light.exe failed with exit code $LASTEXITCODE" }
  if ($CertificatePath -and (Test-Path -LiteralPath $CertificatePath)) {
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtool) {
      Write-Host "  signtool: signing MSI with $CertificatePath" -ForegroundColor Cyan
      & $signtool.Source sign /fd SHA256 /f "$CertificatePath" /t "$TimestampUrl" "$msiPath"
    }
  }
  Write-Host "BuildMsi: $msiPath" -ForegroundColor Green
}

function Build-Msix {
  param([string]$Version, [string]$OutputDir, [string]$CertificatePath, [switch]$DryRun)
  Write-Host "BuildMsix: checking makeappx.exe prerequisites..." -ForegroundColor Cyan
  $makeappx = Get-Command makeappx.exe -ErrorAction SilentlyContinue
  if (-not $makeappx) {
    Write-Host "  [SKIP] makeappx.exe not found. Install Windows SDK to enable MSIX builds." -ForegroundColor Yellow
    return
  }
  Write-Host "  makeappx.exe: $($makeappx.Source)" -ForegroundColor Green
  if ($DryRun) { Write-Host "  [DRY-RUN] Would build MSIX for version $Version" -ForegroundColor Yellow; return }
  $msixStaging = Join-Path $OutputDir ".msix-staging"
  $msixPath    = Join-Path $OutputDir "super-agent-platform-$Version.msix"
  $manifestSrc = Join-Path $PSScriptRoot "msix\AppxManifest.xml"
  $assetsDir   = Join-Path $PSScriptRoot "msix\Assets"
  if (-not (Test-Path $msixStaging)) { New-Item -ItemType Directory -Path $msixStaging | Out-Null }
  Copy-Item -LiteralPath $manifestSrc -Destination (Join-Path $msixStaging "AppxManifest.xml") -Force
  if (Test-Path $assetsDir) {
    $dest = Join-Path $msixStaging "Assets"
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }
    Copy-Item -Path (Join-Path $assetsDir "*") -Destination $dest -Recurse -Force
  }
  & $makeappx.Source pack /d $msixStaging /p $msixPath /l
  if ($LASTEXITCODE -ne 0) { throw "makeappx.exe pack failed with exit code $LASTEXITCODE" }
  if ($CertificatePath -and (Test-Path -LiteralPath $CertificatePath)) {
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtool) {
      Write-Host "  signtool: signing MSIX with $CertificatePath" -ForegroundColor Cyan
      & $signtool.Source sign /fd SHA256 /f "$CertificatePath" /t "$TimestampUrl" "$msixPath"
    }
  }
  Remove-Item -LiteralPath $msixStaging -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "BuildMsix: $msixPath" -ForegroundColor Green
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
