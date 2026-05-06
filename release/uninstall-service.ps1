param(
  [string]$ServiceName = "SuperAgentPlatform",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "Service name: $ServiceName"
if ($DryRun) {
  Write-Host "Dry-run: service would be stopped and deleted if present; no data would be removed." -ForegroundColor Yellow
  exit 0
}

if (-not (Test-Admin)) { throw "Administrator rights are required to uninstall a Windows service." }
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host "Service $ServiceName not found." -ForegroundColor Yellow
  exit 0
}
if ($svc.Status -ne "Stopped") { Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue }
& sc.exe delete $ServiceName | Out-Host
Write-Host "Service removed. User data was not deleted." -ForegroundColor Green
