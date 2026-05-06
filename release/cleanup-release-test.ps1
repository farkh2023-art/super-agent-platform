param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$TempRoot = Join-Path $env:TEMP "super-agent-platform-release-test"

function Write-Step($Message) { Write-Host "[cleanup-release-test] $Message" -ForegroundColor Cyan }

if (-not (Test-Path $TempRoot)) {
  Write-Step "No release test temp root found: $TempRoot"
  exit 0
}

$dirs = @(Get-ChildItem -LiteralPath $TempRoot -Directory -ErrorAction SilentlyContinue)
foreach ($dir in $dirs) {
  $pidFiles = @(Get-ChildItem -LiteralPath $dir.FullName -Recurse -Filter "super-agent.pid" -File -ErrorAction SilentlyContinue)
  foreach ($pidFile in $pidFiles) {
    $pidText = Get-Content -LiteralPath $pidFile.FullName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidText -and ($pidText -as [int])) {
      $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
      if ($proc) {
        if ($DryRun) {
          Write-Step "Would stop PID $pidText from $($pidFile.FullName)"
        } else {
          Write-Step "Stopping PID $pidText from $($pidFile.FullName)"
          Stop-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
        }
      }
    }
  }

  if ($DryRun) {
    Write-Step "Would remove temp directory $($dir.FullName)"
  } else {
    Write-Step "Removing temp directory $($dir.FullName)"
    Remove-Item -LiteralPath $dir.FullName -Recurse -Force
  }
}

if (-not $DryRun) {
  $remaining = @(Get-ChildItem -LiteralPath $TempRoot -Force -ErrorAction SilentlyContinue)
  if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath $TempRoot -Force
  }
}

Write-Host "Cleanup complete." -ForegroundColor Green
