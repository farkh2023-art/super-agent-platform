param()

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PidFile = Join-Path $Root "backend\data\super-agent.pid"

if (-not (Test-Path $PidFile)) {
  Write-Host "No PID file found. If the server is still running, stop the specific node process manually from Task Manager." -ForegroundColor Yellow
  exit 0
}

$pidText = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pidText) {
  Remove-Item -LiteralPath $PidFile -Force
  Write-Host "PID file was empty and has been removed." -ForegroundColor Yellow
  exit 0
}

$proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
if (-not $proc) {
  Remove-Item -LiteralPath $PidFile -Force
  Write-Host "No running process found for PID $pidText. PID file removed." -ForegroundColor Yellow
  exit 0
}

Write-Host "Stopping Super-Agent Platform PID $pidText"
Stop-Process -Id ([int]$pidText) -ErrorAction Stop
Remove-Item -LiteralPath $PidFile -Force
Write-Host "Stopped." -ForegroundColor Green
