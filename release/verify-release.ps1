param(
  [Parameter(Mandatory=$true)]
  [string]$ZipPath,
  [switch]$Json,
  [switch]$Strict,
  [string]$OutputDir = "dist\releases"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedZip = Resolve-Path $ZipPath -ErrorAction Stop
$ResolvedOutput = if ([IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $Root $OutputDir }
if (-not (Test-Path $ResolvedOutput)) { New-Item -ItemType Directory -Path $ResolvedOutput | Out-Null }

$Required = @(
  "backend/package.json",
  "backend/src/",
  "frontend/",
  "release/",
  "docs/",
  ".env.example",
  "SECURITY.md"
)

$Forbidden = @(
  ".env",
  "node_modules/",
  "backend/node_modules/",
  "backend/data/",
  "backend/data-test*/",
  "backend/migration-backups/",
  "dist/",
  "*.sqlite",
  "*.sqlite-wal",
  "*.sqlite-shm",
  "github_pat*.txt",
  "*tokens*.txt",
  "*.pem",
  "*.key"
)

$SensitivePatterns = @(
  "sk-",
  "github_pat_",
  "Authorization:",
  "refreshToken",
  "password_hash",
  "refresh_token_hash",
  "jti_hash"
)

function Normalize($Value) { return ($Value -replace '\\','/').TrimStart('/') }
function Match-Forbidden($Entry) {
  $rel = Normalize $Entry
  $leaf = Split-Path $rel -Leaf
  foreach ($pattern in $Forbidden) {
    $p = Normalize $pattern
    if ($p.EndsWith('/')) {
      if ($rel.StartsWith($p, [StringComparison]::OrdinalIgnoreCase)) { return $pattern }
      continue
    }
    if ($rel -like $p -or $leaf -like $p) { return $pattern }
  }
  return $null
}

function Test-ReferenceFile($RelPath) {
  $rel = Normalize $RelPath
  return (
    $rel -eq ".env.example" -or
    $rel -eq "release/config/.env.template" -or
    $rel -like "docs/*" -or
    $rel -like "release/docs/*" -or
    $rel -like "backend/src/*" -or
    $rel -like "frontend/*" -or
    $rel -like "release/*.ps1" -or
    $rel -eq "SECURITY.md" -or
    $rel -eq "README.md"
  )
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ResolvedZip.Path)
try {
  $entries = @($archive.Entries | ForEach-Object { Normalize $_.FullName })
  $files = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith("/") })

  $errors = [System.Collections.Generic.List[string]]::new()
  $warnings = [System.Collections.Generic.List[string]]::new()

  $manifestEntry = $archive.Entries | Where-Object { (Normalize $_.FullName) -eq "MANIFEST.json" } | Select-Object -First 1

  $externalManifestPath = Join-Path (Split-Path $ResolvedZip.Path -Parent) "MANIFEST.json"
  $manifest = $null
  if ($manifestEntry) {
    $reader = New-Object IO.StreamReader($manifestEntry.Open())
    try { $manifest = ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
  } elseif (Test-Path $externalManifestPath) {
    $manifest = Get-Content -Raw $externalManifestPath | ConvertFrom-Json
  } else {
    $errors.Add("MANIFEST.json not found.")
  }

  $actualHash = (Get-FileHash -LiteralPath $ResolvedZip.Path -Algorithm SHA256).Hash
  $expectedHash = if ($manifest -and $manifest.checksumSHA256) { [string]$manifest.checksumSHA256 } else { $null }
  if ($expectedHash -and $expectedHash -ne $actualHash) {
    $errors.Add("ZIP SHA256 mismatch. Expected $expectedHash, got $actualHash.")
  }

  foreach ($req in $Required) {
    $r = Normalize $req
    if ($r.EndsWith('/')) {
      if (-not ($entries | Where-Object { $_.StartsWith($r, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1)) {
        $errors.Add("Missing required directory $req")
      }
    } elseif (-not ($entries -contains $r)) {
      $errors.Add("Missing required file $req")
    }
  }

  $forbiddenMatches = @()
  foreach ($entry in $entries) {
    $match = Match-Forbidden $entry
    if ($match) { $forbiddenMatches += [ordered]@{ file = $entry; rule = $match } }
  }
  foreach ($m in $forbiddenMatches) { $errors.Add("Forbidden file matched $($m.rule): $($m.file)") }

  $sensitiveMatches = @()
  foreach ($entry in $files) {
    $rel = Normalize $entry.FullName
    if ($rel -like "*.png" -or $rel -like "*.jpg" -or $rel -like "*.jpeg" -or $rel -like "*.gif" -or $rel -like "*.zip") { continue }
    $reader = New-Object IO.StreamReader($entry.Open())
    try { $text = $reader.ReadToEnd() } catch { $text = "" } finally { $reader.Dispose() }
    foreach ($pattern in $SensitivePatterns) {
      if ($text -match [Regex]::Escape($pattern)) {
        if (Test-ReferenceFile $rel) { continue }
        $sensitiveMatches += [ordered]@{ file = $rel; pattern = $pattern }
        if ($Strict) { $errors.Add("Sensitive pattern '$pattern' found in $rel") }
        else { $warnings.Add("Sensitive pattern '$pattern' found in $rel") }
      }
    }
  }

  $status = if ($errors.Count -gt 0) { "ERROR" } elseif ($warnings.Count -gt 0) { "WARNING" } else { "OK" }
  $report = [ordered]@{
    status = $status
    zipPath = $ResolvedZip.Path
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    strict = [bool]$Strict
    sha256 = $actualHash
    manifestChecksum = $expectedHash
    entriesCount = $entries.Count
    required = $Required
    forbiddenRules = $Forbidden
    forbiddenMatches = $forbiddenMatches
    sensitiveMatches = $sensitiveMatches
    warnings = @($warnings)
    errors = @($errors)
  }

  $jsonPath = Join-Path $ResolvedOutput "VERIFY_REPORT.json"
  $mdPath = Join-Path $ResolvedOutput "VERIFY_REPORT.md"
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

  $md = @()
  $md += "# Release Verification Report"
  $md += ""
  $md += "- Status: $status"
  $md += "- ZIP: $($ResolvedZip.Path)"
  $md += "- SHA256: $actualHash"
  $md += "- Strict: $([bool]$Strict)"
  $md += "- Entries: $($entries.Count)"
  $md += ""
  $md += "## Errors"
  if ($errors.Count) { foreach ($e in $errors) { $md += "- $e" } } else { $md += "- None" }
  $md += ""
  $md += "## Warnings"
  if ($warnings.Count) { foreach ($w in $warnings) { $md += "- $w" } } else { $md += "- None" }
  $md += ""
  $md += "## Forbidden Matches"
  if ($forbiddenMatches.Count) { foreach ($m in $forbiddenMatches) { $md += ("- {0} matched {1}" -f $m.file, $m.rule) } } else { $md += "- None" }
  $md | Set-Content -LiteralPath $mdPath -Encoding UTF8

  if ($Json) { $report | ConvertTo-Json -Depth 8 }
  else {
    $color = if ($status -eq "OK") { "Green" } elseif ($status -eq "WARNING") { "Yellow" } else { "Red" }
    Write-Host "Verify release: $status" -ForegroundColor $color
    Write-Host "Report JSON: $jsonPath"
    Write-Host "Report MD  : $mdPath"
  }

  if ($errors.Count -gt 0) { exit 1 }
}
finally {
  $archive.Dispose()
}
