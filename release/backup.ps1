param(
  [string]$BaseUrl = "http://localhost:3001",
  [switch]$IncludeRawSqlite
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackupDir = Join-Path $Root "backups\local"
$DataDir = Join-Path $Root "backend\data"
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $BackupDir "super-agent-backup-$stamp.zip"

try {
  Invoke-WebRequest -Uri "$BaseUrl/api/backup/download" -OutFile $out -TimeoutSec 20 | Out-Null
  Write-Host "Downloaded secure API backup: $out" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "Backup endpoint unavailable; creating local fallback archive." -ForegroundColor Yellow
}

if (-not (Test-Path $DataDir)) { throw "No backend data directory found: $DataDir" }

$temp = Join-Path $BackupDir ".backup-staging-$stamp"
if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null

Get-ChildItem -LiteralPath $DataDir -Recurse -File | ForEach-Object {
  $full = $_.FullName
  $rel = $full.Substring($DataDir.Length).TrimStart('\','/')
  $lower = $rel.ToLowerInvariant()
  $blocked = $lower -like "*.sqlite" -or $lower -like "*.sqlite-wal" -or $lower -like "*.sqlite-shm" -or $lower -like "*tokens*.txt" -or $lower -like "github_pat*.txt" -or $lower -like "*.env"
  if ($IncludeRawSqlite) { $blocked = $lower -like "*tokens*.txt" -or $lower -like "github_pat*.txt" -or $lower -like "*.env" }
  if (-not $blocked) {
    $dest = Join-Path $temp $rel
    $parent = Split-Path $dest -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    Copy-Item -LiteralPath $full -Destination $dest
  }
}

Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $out -Force
Remove-Item -LiteralPath $temp -Recurse -Force
Write-Host "Created local fallback backup: $out" -ForegroundColor Green
