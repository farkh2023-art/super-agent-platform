param(
  [switch]$KeepData,
  [switch]$RemoveData,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Targets = @(
  @{ Path = Join-Path $Root "logs"; Label = "logs"; Safe = $true },
  @{ Path = Join-Path $Root "dist\releases"; Label = "dist releases"; Safe = $true }
)

if ($RemoveData) {
  $Targets += @{ Path = Join-Path $Root "backups\local"; Label = "local backups"; Safe = $false }
  $Targets += @{ Path = Join-Path $Root "backend\data"; Label = "backend data"; Safe = $false }
}

Write-Host "Stopping local server if running."
if ($DryRun) { Write-Host "Dry-run: would call release\stop.ps1." -ForegroundColor Yellow }
else { & (Join-Path $PSScriptRoot "stop.ps1") }

if ($KeepData -or -not $RemoveData) {
  Write-Host "Default uninstall keeps .env, backend data and backups." -ForegroundColor Yellow
}

foreach ($target in $Targets) {
  if (-not (Test-Path $target.Path)) { continue }
  if ($DryRun) {
    Write-Host "Dry-run: would remove $($target.Label): $($target.Path)"
    continue
  }
  if (-not $target.Safe) {
    $answer = Read-Host "Type DELETE to remove $($target.Label) at $($target.Path)"
    if ($answer -ne "DELETE") {
      Write-Host "Skipped $($target.Label)."
      continue
    }
  }
  Remove-Item -LiteralPath $target.Path -Recurse -Force
  Write-Host "Removed $($target.Label): $($target.Path)"
}

Write-Host "Uninstall cleanup complete." -ForegroundColor Green
