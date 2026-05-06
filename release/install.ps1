param()

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend = Join-Path $Root "backend"
$EnvPath = Join-Path $Root ".env"
$EnvExample = Join-Path $Root ".env.example"

function Write-Step($Message) { Write-Host "[install] $Message" -ForegroundColor Cyan }
function Require-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "$Name is required. Install Node.js LTS for Windows, then re-run this script." }
  return $cmd
}

Write-Step "Checking Node.js and npm"
Require-Command "node" | Out-Null
Require-Command "npm" | Out-Null
Write-Host "Node: $(node --version)"
Write-Host "npm : $(npm --version)"

if (-not (Test-Path $Backend)) { throw "Backend folder not found: $Backend" }

Write-Step "Installing backend dependencies"
Push-Location $Backend
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}

Write-Step "Preparing local configuration"
if (-not (Test-Path $EnvPath)) {
  if (Test-Path $EnvExample) {
    Copy-Item -LiteralPath $EnvExample -Destination $EnvPath -Force:$false
    Write-Host "Created .env from .env.example. Edit it before using real providers."
  } else {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "config\.env.template") -Destination $EnvPath -Force:$false
    Write-Host "Created .env from release config template."
  }
} else {
  Write-Host ".env already exists; leaving it unchanged."
}

Write-Step "Creating local runtime directories"
$dirs = @(
  (Join-Path $Backend "data"),
  (Join-Path $Backend "data\logs"),
  (Join-Path $Root "backups\local"),
  (Join-Path $Root "dist\releases")
)
foreach ($dir in $dirs) {
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
}

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Next commands:"
Write-Host "  .\release\start.ps1 -Mode demo"
Write-Host "  .\release\health-check.ps1"
Write-Host "  Open http://localhost:3001"
