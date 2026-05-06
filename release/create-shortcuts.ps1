param(
  [switch]$StartMenu,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Desktop = [Environment]::GetFolderPath("Desktop")
$Programs = [Environment]::GetFolderPath("Programs")
$Targets = @(
  @{ Name = "Super-Agent Platform"; Script = "start.ps1"; Args = "-NoBrowser" },
  @{ Name = "Super-Agent Platform Demo"; Script = "demo.ps1"; Args = "" },
  @{ Name = "Super-Agent Health Check"; Script = "health-check.ps1"; Args = "" }
)

function New-Shortcut($Folder, $Name, $Script, $Args) {
  $path = Join-Path $Folder "$Name.lnk"
  $target = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $scriptPath = Join-Path $PSScriptRoot $Script
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" $Args"
  if ($DryRun) {
    Write-Host "Dry-run: would create shortcut $path -> $arguments"
    return
  }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $Root.Path
  $shortcut.Save()
  Write-Host "Created shortcut: $path" -ForegroundColor Green
}

foreach ($item in $Targets) { New-Shortcut $Desktop $item.Name $item.Script $item.Args }
if ($StartMenu) {
  $folder = Join-Path $Programs "Super-Agent Platform"
  if (-not $DryRun -and -not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
  foreach ($item in $Targets) { New-Shortcut $folder $item.Name $item.Script $item.Args }
}
