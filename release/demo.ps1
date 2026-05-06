param([switch]$NoBrowser)

$env:AI_PROVIDER = "mock"
$env:AUTH_MODE = "single"
$env:STORAGE_MODE = "json"
$env:DATA_DIR = "./data"
$env:PORT = if ($env:PORT) { $env:PORT } else { "3001" }

Write-Host "Starting demo mode. No API key is required and .env is not modified." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "start.ps1") -Mode demo -NoBrowser:$NoBrowser
