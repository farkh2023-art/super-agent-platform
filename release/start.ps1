param(
  [ValidateSet("normal", "demo")]
  [string]$Mode = "normal",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend = Join-Path $Root "backend"
$EnvPath = Join-Path $Root ".env"
$DataDir = Join-Path $Backend "data"
$PidFile = Join-Path $DataDir "super-agent.pid"

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }
if ($Mode -eq "normal" -and -not (Test-Path $EnvPath)) {
  throw ".env is missing. Run .\release\install.ps1 first or use .\release\start.ps1 -Mode demo."
}

$port = if ($env:PORT) { $env:PORT } else { "3001" }
$env:PORT = $port
if ($Mode -eq "demo") {
  $env:AI_PROVIDER = "mock"
  $env:AUTH_MODE = "single"
  $env:STORAGE_MODE = "json"
  $env:DATA_DIR = "./data"
  Write-Host "Demo mode active: AI_PROVIDER=mock, AUTH_MODE=single, STORAGE_MODE=json. No API key required." -ForegroundColor Yellow
}

if (Test-Path $PidFile) {
  $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($oldPid -and (Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue)) {
    throw "Server already appears to be running with PID $oldPid. Use .\release\stop.ps1 first."
  }
}

Write-Host "Starting Super-Agent Platform on http://localhost:$port"
$proc = Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $Backend -PassThru -WindowStyle Hidden
Set-Content -LiteralPath $PidFile -Value $proc.Id -Encoding ASCII
Write-Host "Started PID $($proc.Id). PID recorded in backend\data\super-agent.pid." -ForegroundColor Green

Start-Sleep -Seconds 2
if (-not $NoBrowser) {
  try { Start-Process "http://localhost:$port" | Out-Null } catch { Write-Host "Browser open failed: $($_.Exception.Message)" -ForegroundColor Yellow }
}

Write-Host "Useful commands:"
Write-Host "  .\release\health-check.ps1"
Write-Host "  .\release\stop.ps1"
