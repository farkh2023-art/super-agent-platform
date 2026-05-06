param(
  [string]$ServiceName = "SuperAgentPlatform",
  [int]$Port = 3001,
  [ValidateSet("demo", "normal")]
  [string]$Mode = "normal",
  [switch]$StartAfterInstall,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Logs = Join-Path $Root "logs\service"
$StartScript = Join-Path $PSScriptRoot "start.ps1"

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -Mode $Mode -NoBrowser"
Write-Host "Service name : $ServiceName"
Write-Host "Port         : $Port"
Write-Host "Mode         : $Mode"
Write-Host "Command      : $cmd"
Write-Host "Logs         : $Logs"

if ($DryRun) {
  Write-Host "Dry-run: service would be installed with sc.exe; no changes made." -ForegroundColor Yellow
  exit 0
}

if (-not (Test-Admin)) { throw "Administrator rights are required to install a Windows service." }
if (-not (Test-Path $Logs)) { New-Item -ItemType Directory -Path $Logs | Out-Null }
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  throw "Service $ServiceName already exists. Uninstall it first or choose another -ServiceName."
}

$env:PORT = [string]$Port
& sc.exe create $ServiceName binPath= $cmd start= demand DisplayName= "Super-Agent Platform" | Out-Host
& sc.exe description $ServiceName "Local Super-Agent Platform service. Uses local .env; no secrets are stored in service arguments." | Out-Host
if ($StartAfterInstall) { Start-Service -Name $ServiceName }
Write-Host "Service installed. Start it from Services or run: Start-Service $ServiceName" -ForegroundColor Green
