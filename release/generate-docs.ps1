param(
  [string]$OutputDir = "dist\docs",
  [switch]$DryRun,
  [switch]$IncludePdf,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedOutput = if ([IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $Root $OutputDir }
$ManifestPath = Join-Path $ResolvedOutput "DOCS_MANIFEST.json"

$Docs = @(
  @{ source = "docs/USER_GUIDE.md"; title = "User Guide"; output = "USER_GUIDE.html" },
  @{ source = "docs/ADMIN_GUIDE.md"; title = "Admin Guide"; output = "ADMIN_GUIDE.html" },
  @{ source = "docs/INSTALLATION_WINDOWS.md"; title = "Windows Installation"; output = "INSTALLATION_WINDOWS.html" },
  @{ source = "docs/TROUBLESHOOTING.md"; title = "Troubleshooting"; output = "TROUBLESHOOTING.html" },
  @{ source = "docs/SECURITY_CHECKLIST.md"; title = "Security Checklist"; output = "SECURITY_CHECKLIST.html" },
  @{ source = "docs/API.md"; title = "API Reference"; output = "API.html" },
  @{ source = "docs/PHASE9.md"; title = "Phase 9 Distribution CI"; output = "PHASE9.html" }
)

function Normalize-Rel($Value) {
  return ($Value -replace '\\','/').TrimStart('/')
}

function Test-PublicDocSource($Source) {
  $normalized = Normalize-Rel $Source
  if (-not $normalized.StartsWith("docs/", [StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ($normalized.Contains("..")) { return $false }
  if ($normalized -match '(^|/)\.env($|[./])') { return $false }
  if ($normalized -match 'tokens?') { return $false }
  if ($normalized -match '\.sqlite($|[-.])') { return $false }
  return $true
}

function ConvertTo-SafeHtml($Markdown, $Title, $GeneratedAt) {
  $encoded = [System.Net.WebUtility]::HtmlEncode($Markdown)
  $safeTitle = [System.Net.WebUtility]::HtmlEncode($Title)
  return @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$safeTitle</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; line-height: 1.6; color: #172033; }
    header { border-bottom: 1px solid #d8dee9; margin-bottom: 20px; padding-bottom: 12px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <header>
    <h1>$safeTitle</h1>
    <div class="meta">Generated at $GeneratedAt</div>
  </header>
  <pre>$encoded</pre>
</body>
</html>
"@
}

function Get-PdfTool {
  $wkhtmltopdf = Get-Command wkhtmltopdf -ErrorAction SilentlyContinue
  if ($wkhtmltopdf) { return @{ name = "wkhtmltopdf"; command = $wkhtmltopdf.Source } }

  $pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
  if ($pandoc) { return @{ name = "pandoc"; command = $pandoc.Source } }

  return $null
}

$generatedAt = (Get-Date).ToUniversalTime().ToString("o")
$manifest = [System.Collections.Generic.List[object]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$pdfTool = if ($IncludePdf) { Get-PdfTool } else { $null }
$pdfStatus = if ($IncludePdf -and -not $pdfTool) { "pdfSkipped" } elseif ($IncludePdf) { "pdfEnabled" } else { "pdfNotRequested" }

if ($IncludePdf -and -not $pdfTool) {
  $warnings.Add("PDF generation requested but wkhtmltopdf or pandoc was not found; skipping PDF export.")
}

if (-not $DryRun -and -not (Test-Path $ResolvedOutput)) {
  New-Item -ItemType Directory -Path $ResolvedOutput | Out-Null
}

foreach ($doc in $Docs) {
  $source = Normalize-Rel $doc.source
  if (-not (Test-PublicDocSource $source)) { throw "Unsafe documentation source: $source" }

  $sourcePath = Join-Path $Root $source
  $outputRel = Normalize-Rel (Join-Path $OutputDir $doc.output)
  $outputPath = Join-Path $ResolvedOutput $doc.output

  if (-not (Test-Path $sourcePath)) { throw "Documentation source not found: $source" }

  if ($DryRun) {
    Write-Host "[DRY-RUN] Generate $outputRel from $source"
    $sha256 = $null
  } else {
    $markdown = Get-Content -Raw -LiteralPath $sourcePath
    $html = ConvertTo-SafeHtml -Markdown $markdown -Title $doc.title -GeneratedAt $generatedAt
    Set-Content -LiteralPath $outputPath -Value $html -Encoding UTF8
    $sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash

    if ($IncludePdf -and $pdfTool) {
      $pdfPath = [IO.Path]::ChangeExtension($outputPath, ".pdf")
      if ($pdfTool.name -eq "wkhtmltopdf") {
        & $pdfTool.command $outputPath $pdfPath | Out-Null
      } elseif ($pdfTool.name -eq "pandoc") {
        & $pdfTool.command $sourcePath -o $pdfPath | Out-Null
      }
      if ($LASTEXITCODE -ne 0) {
        $warnings.Add("PDF export failed for $source; HTML output was kept.")
      }
    }
  }

  $manifest.Add([ordered]@{
    source = $source
    output = $outputRel
    sha256 = $sha256
    generatedAt = $generatedAt
    format = "html"
  })
}

$result = [ordered]@{
  dryRun = [bool]$DryRun
  outputDir = Normalize-Rel $OutputDir
  manifest = Normalize-Rel (Join-Path $OutputDir "DOCS_MANIFEST.json")
  docs = @($manifest)
  count = $manifest.Count
  pdfStatus = $pdfStatus
  warnings = @($warnings)
}

if (-not $DryRun) {
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
}

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Host "Docs generation: $(if ($DryRun) { 'DryRun' } else { 'Done' })"
  Write-Host "Output: $(Normalize-Rel $OutputDir)"
  Write-Host "Manifest: $(Normalize-Rel (Join-Path $OutputDir 'DOCS_MANIFEST.json'))"
  Write-Host "PDF: $pdfStatus"
  foreach ($warning in $warnings) { Write-Warning $warning }
}
