param(
  [Parameter(Mandatory=$true)]
  [string]$ZipPath,
  [string]$Version,
  [string]$OutputDir = "dist\releases",
  [string]$SignedBy = "local-user"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedZip = Resolve-Path $ZipPath -ErrorAction Stop
$ResolvedOutput = if ([IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $Root $OutputDir }
if (-not (Test-Path $ResolvedOutput)) { New-Item -ItemType Directory -Path $ResolvedOutput | Out-Null }

if (-not $Version) {
  $name = [IO.Path]::GetFileNameWithoutExtension($ResolvedZip.Path)
  $Version = $name -replace '^super-agent-platform-', ''
}

$sha = (Get-FileHash -LiteralPath $ResolvedZip.Path -Algorithm SHA256).Hash
$shaPath = Join-Path $ResolvedOutput ("{0}.sha256" -f [IO.Path]::GetFileName($ResolvedZip.Path))
"$sha  $([IO.Path]::GetFileName($ResolvedZip.Path))" | Set-Content -LiteralPath $shaPath -Encoding ASCII

$commit = "unknown"
$tag = $null
try { $commit = (git -c safe.directory="$($Root.Path.Replace('\','/'))" rev-parse HEAD 2>$null) } catch {}
try { $tag = (git -c safe.directory="$($Root.Path.Replace('\','/'))" describe --tags --exact-match 2>$null) } catch {}

$signature = [ordered]@{
  version = $Version
  zip = [IO.Path]::GetFileName($ResolvedZip.Path)
  sha256 = $sha
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  gitCommit = $commit
  gitTag = $tag
  signedBy = $SignedBy
  signatureType = "local-checksum"
  note = "Local checksum signature only; not a certificate-backed code signing signature."
}

$sigPath = Join-Path $ResolvedOutput "RELEASE_SIGNATURE.json"
$signature | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $sigPath -Encoding UTF8

Write-Host "Local checksum signature written:" -ForegroundColor Green
Write-Host "  $shaPath"
Write-Host "  $sigPath"
Write-Host "SHA256: $sha"
