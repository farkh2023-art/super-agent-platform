param(
  [string]$Version = "v3.0.0-phase-12",
  [switch]$IncludeTests,
  [string]$OutputDir = "dist\releases",
  [switch]$DryRun,
  [switch]$Verify,
  [switch]$Strict,
  [switch]$BuildMsi,
  [switch]$BuildMsix,
  [string]$CertificatePath = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedOutput = Join-Path $Root $OutputDir
$SafeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
$ZipName = "super-agent-platform-$SafeVersion.zip"
$ZipPath = Join-Path $ResolvedOutput $ZipName
$ManifestPath = Join-Path $ResolvedOutput "MANIFEST.json"
$Stage = Join-Path $ResolvedOutput ".staging-$SafeVersion"

$ExcludedPatterns = @(
  ".env",
  "node_modules",
  "backend/node_modules",
  "backend/data",
  "backend/data-test*",
  "backend/migration-backups",
  "dist",
  "*.sqlite",
  "*.sqlite-wal",
  "*.sqlite-shm",
  "auth.sqlite",
  "storage-runtime.json",
  "auth-runtime.json",
  "*.db",
  "*.bak",
  "*_secret*",
  "*_key*",
  ".claude/settings.local.json",
  "github_pat*.txt",
  "*github_pat*",
  "*tokens*.txt",
  "*.pem",
  "*.key",
  "logs",
  "*.log"
)

function Normalize-Rel($Path) {
  return ($Path -replace '\\','/').TrimStart('/')
}

function Test-Excluded($RelPath) {
  $rel = Normalize-Rel $RelPath
  $leaf = Split-Path $rel -Leaf
  foreach ($pattern in $ExcludedPatterns) {
    $p = Normalize-Rel $pattern
    if ($rel -like $p -or $leaf -like $p) { return $true }
    if ($rel.StartsWith($p.TrimEnd('*'), [System.StringComparison]::OrdinalIgnoreCase) -and $p.EndsWith("*")) { return $true }
  }
  if (-not $IncludeTests -and $rel.StartsWith("backend/tests/", [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $false
}

function Add-SourceFiles($RelativePath, [System.Collections.Generic.List[string]]$Included, [System.Collections.Generic.List[string]]$Skipped) {
  $source = Join-Path $Root $RelativePath
  if (-not (Test-Path $source)) { return }
  if (Test-Path $source -PathType Leaf) {
    $rel = Normalize-Rel $RelativePath
    if (Test-Excluded $rel) { $Skipped.Add($rel); return }
    $Included.Add($rel)
    if (-not $DryRun) {
      $dest = Join-Path $Stage $rel
      $parent = Split-Path $dest -Parent
      if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
      Copy-Item -LiteralPath $source -Destination $dest
    }
    return
  }
  Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object {
    $rel = Normalize-Rel ($_.FullName.Substring($Root.Path.Length).TrimStart('\','/'))
    if (Test-Excluded $rel) {
      $Skipped.Add($rel)
    } else {
      $Included.Add($rel)
      if (-not $DryRun) {
        $dest = Join-Path $Stage $rel
        $parent = Split-Path $dest -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        Copy-Item -LiteralPath $_.FullName -Destination $dest
      }
    }
  }
}

if (-not (Test-Path $ResolvedOutput)) { New-Item -ItemType Directory -Path $ResolvedOutput | Out-Null }
if ((Test-Path $Stage) -and -not $DryRun) { Remove-Item -LiteralPath $Stage -Recurse -Force }
if (-not $DryRun) { New-Item -ItemType Directory -Path $Stage | Out-Null }

$included = [System.Collections.Generic.List[string]]::new()
$skipped = [System.Collections.Generic.List[string]]::new()

$sources = @(
  "backend/src",
  "backend/scripts",
  "backend/package.json",
  "backend/package-lock.json",
  "frontend",
  "docs",
  "release",
  ".env.example",
  "README.md",
  "SECURITY.md"
)
if ($IncludeTests) { $sources += "backend/tests" }

foreach ($src in $sources) { Add-SourceFiles $src $included $skipped }

$commit = "unknown"
$tag = $null
try { $commit = (git -c safe.directory="$($Root.Path.Replace('\','/'))" rev-parse HEAD 2>$null) } catch {}
try { $tag = (git -c safe.directory="$($Root.Path.Replace('\','/'))" describe --tags --exact-match 2>$null) } catch {}

$zipHash = $null

$manifest = [ordered]@{
  version = $Version
  date = (Get-Date).ToUniversalTime().ToString("o")
  filesIncluded = $included | Sort-Object
  filesExcluded = $ExcludedPatterns
  skippedByRule = ($skipped | Sort-Object -Unique)
  commitGit = $commit
  tag = $tag
  testsTotalKnown = 1000
  zip = if ($DryRun) { $null } else { $ZipName }
  checksumSHA256 = $zipHash
  dryRun = [bool]$DryRun
}

$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

if ($DryRun) {
  Write-Host "Dry run complete. Manifest written: $ManifestPath" -ForegroundColor Yellow
  Write-Host "Files that would be included: $($included.Count)"
} else {
  if (Test-Path $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
  Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $ZipPath -Force
  $zipHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
  $manifest.checksumSHA256 = $zipHash
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
  Remove-Item -LiteralPath $Stage -Recurse -Force
  Write-Host "Release ZIP created: $ZipPath" -ForegroundColor Green
  Write-Host "Manifest written: $ManifestPath"
  Write-Host "SHA256: $zipHash"
  if ($Verify) {
    Write-Host "Running release verification..."
    & (Join-Path $PSScriptRoot "verify-release.ps1") -ZipPath $ZipPath -OutputDir $OutputDir -Strict:$Strict
    if ($LASTEXITCODE -ne 0) { throw "Release verification failed." }
    Write-Host "Verify status: OK" -ForegroundColor Green
  } else {
    Write-Host "Verify status: skipped"
  }
}

if ($BuildMsi -or $BuildMsix) {
  & (Join-Path $PSScriptRoot "packaging-tools.ps1") `
    -Version $Version -OutputDir $OutputDir `
    -BuildMsi:$BuildMsi -BuildMsix:$BuildMsix `
    -CertificatePath $CertificatePath -DryRun:$DryRun
  if ($LASTEXITCODE -ne 0) { throw "packaging-tools failed with exit code $LASTEXITCODE" }
}
