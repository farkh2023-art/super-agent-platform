param(
  [string]$BaseUrl = "http://localhost:3001",
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$checks = @()

function Invoke-Check($Name, $Path, $Required) {
  $url = "$BaseUrl$Path"
  try {
    $res = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 5
    $script:checks += [ordered]@{ name = $Name; path = $Path; status = "OK"; required = $Required; detail = "HTTP OK"; response = $res }
  } catch {
    $status = if ($Required) { "ERROR" } else { "WARNING" }
    $script:checks += [ordered]@{ name = $Name; path = $Path; status = $status; required = $Required; detail = $_.Exception.Message }
  }
}

Invoke-Check "API health" "/api/health" $true
Invoke-Check "Admin health" "/api/admin/health" $false
Invoke-Check "Agents" "/api/agents" $true
Invoke-Check "Storage status" "/api/storage/status" $false

$overall = if ($checks.status -contains "ERROR") { "ERROR" } elseif ($checks.status -contains "WARNING") { "WARNING" } else { "OK" }
$result = [ordered]@{ status = $overall; baseUrl = $BaseUrl; checkedAt = (Get-Date).ToUniversalTime().ToString("o"); checks = $checks }

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Host "Health check: $overall" -ForegroundColor ($(if ($overall -eq "OK") { "Green" } elseif ($overall -eq "WARNING") { "Yellow" } else { "Red" }))
  foreach ($check in $checks) {
    $color = if ($check.status -eq "OK") { "Green" } elseif ($check.status -eq "WARNING") { "Yellow" } else { "Red" }
    Write-Host "[$($check.status)] $($check.name) $($check.path) - $($check.detail)" -ForegroundColor $color
  }
}

if ($overall -eq "ERROR") { exit 1 }
