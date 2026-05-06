param(
  [string]$Path,
  [string]$OutputDir = "dist\releases",
  [switch]$All
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedOutput = if ([IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $Root $OutputDir }

$Results = [System.Collections.Generic.List[object]]::new()

function Test-PackageSignature([string]$FilePath) {
  $sig = Get-AuthenticodeSignature -LiteralPath $FilePath
  $result = [ordered]@{
    file          = [IO.Path]::GetFileName($FilePath)
    path          = $FilePath
    status        = $sig.Status.ToString()
    signatureType = if ($sig.SignatureType) { $sig.SignatureType.ToString() } else { "None" }
    thumbprint    = $sig.SignerCertificate.Thumbprint
    valid         = ($sig.Status -eq "Valid")
  }
  $Results.Add($result)
  $color = if ($result.valid) { "Green" } elseif ($result.status -eq "NotSigned") { "Yellow" } else { "Red" }
  Write-Host ("  {0}: {1}" -f $result.file, $result.status) -ForegroundColor $color
  return $result
}

Write-Host "verify-signature: Authenticode check for .msi and .msix packages..." -ForegroundColor Cyan

if ($Path) {
  $ext = [IO.Path]::GetExtension($Path).ToLower()
  if ($ext -in @('.msi', '.msix', '.appxbundle')) {
    if (Test-Path -LiteralPath $Path) {
      Test-PackageSignature $Path | Out-Null
    } else {
      Write-Host "  [WARN] File not found: $Path" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  [WARN] '$ext' not supported. Expected: .msi, .msix, .appxbundle" -ForegroundColor Yellow
  }
} elseif ($All) {
  $files = @(Get-ChildItem -LiteralPath $ResolvedOutput -Include "*.msi","*.msix","*.appxbundle" -File -Recurse -ErrorAction SilentlyContinue)
  if ($files.Count -eq 0) {
    Write-Host "  No .msi, .msix, or .appxbundle files found in: $ResolvedOutput" -ForegroundColor Yellow
  } else {
    foreach ($f in $files) { Test-PackageSignature $f.FullName | Out-Null }
  }
} else {
  Write-Host "  Usage: verify-signature.ps1 -Path <file.msi|.msix> or -All" -ForegroundColor Yellow
}

$reportPath = Join-Path $ResolvedOutput "VERIFY_SIGNATURE_REPORT.json"
$report = [ordered]@{
  generatedAt  = (Get-Date).ToUniversalTime().ToString("o")
  checkedFiles = $Results.Count
  results      = @($Results)
}
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host "VERIFY_SIGNATURE_REPORT written: $reportPath" -ForegroundColor Green
