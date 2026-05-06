param(
  [string]$BaseUrl = "http://localhost:3001",
  [switch]$Json,
  [switch]$Deep
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $Root "logs"
$ReportPath = Join-Path $LogDir "health-check-latest.json"
$checks = @()

function Add-LocalCheck($Name, $Ok, $Detail, $Required = $true) {
  $status = if ($Ok) { "OK" } elseif ($Required) { "ERROR" } else { "WARNING" }
  $script:checks += [ordered]@{ name = $Name; path = $null; status = $status; required = $Required; detail = $Detail }
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Check($Name, $Path, $Required) {
  $url = "$BaseUrl$Path"
  try {
    Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 5 | Out-Null
    $script:checks += [ordered]@{ name = $Name; path = $Path; status = "OK"; required = $Required; detail = "HTTP OK" }
  } catch {
    $status = if ($Required) { "ERROR" } else { "WARNING" }
    $script:checks += [ordered]@{ name = $Name; path = $Path; status = $status; required = $Required; detail = $_.Exception.Message }
  }
}

Add-LocalCheck "Node.js" (Test-Command "node") ($(if (Test-Command "node") { node --version } else { "node not found" })) $true
Add-LocalCheck "npm" (Test-Command "npm") ($(if (Test-Command "npm") { npm --version } else { "npm not found" })) $true
Add-LocalCheck ".env file" (Test-Path (Join-Path $Root ".env")) ".env local config presence" $false
Add-LocalCheck "backend package" (Test-Path (Join-Path $Root "backend\package.json")) "backend/package.json presence" $true

$uri = [Uri]$BaseUrl
$port = $uri.Port
$tcpOpen = $false
try {
  $client = New-Object Net.Sockets.TcpClient
  $async = $client.BeginConnect($uri.Host, $port, $null, $null)
  $tcpOpen = $async.AsyncWaitHandle.WaitOne(1000, $false)
  if ($tcpOpen) { $client.EndConnect($async) }
  $client.Close()
} catch { $tcpOpen = $false }
Add-LocalCheck "Port $port" $tcpOpen "TCP listener on $($uri.Host):$port" $false

Invoke-Check "API health" "/api/health" $true
Invoke-Check "Admin health" "/api/admin/health" $false
Invoke-Check "Agents" "/api/agents" $true
Invoke-Check "Storage status" "/api/storage/status" $false
if ($Deep) {
  Invoke-Check "Detailed health" "/api/health/detailed" $false
  Invoke-Check "Auth mode" "/api/auth/mode" $false
}

$overall = if ($checks.status -contains "ERROR") { "ERROR" } elseif ($checks.status -contains "WARNING") { "WARNING" } else { "OK" }
$result = [ordered]@{ status = $overall; baseUrl = $BaseUrl; checkedAt = (Get-Date).ToUniversalTime().ToString("o"); deep = [bool]$Deep; checks = $checks }

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Host "Health check: $overall" -ForegroundColor ($(if ($overall -eq "OK") { "Green" } elseif ($overall -eq "WARNING") { "Yellow" } else { "Red" }))
  foreach ($check in $checks) {
    $color = if ($check.status -eq "OK") { "Green" } elseif ($check.status -eq "WARNING") { "Yellow" } else { "Red" }
    Write-Host "[$($check.status)] $($check.name) $($check.path) - $($check.detail)" -ForegroundColor $color
  }
  Write-Host "Report: $ReportPath"
}

if ($overall -eq "ERROR") { exit 1 }
