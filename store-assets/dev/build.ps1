# Builds a clean Chrome Web Store upload zip from the extension/ folder.
# The zip contains ONLY the runtime files, with manifest.json at the zip root.
# Output: store-assets/dev/timetrack-v<version>.zip
# Usage:  pwsh store-assets/dev/build.ps1

$ErrorActionPreference = 'Stop'
# store-assets/dev/build.ps1  ->  project root is two levels up
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$extDir = Join-Path $root 'extension'

$manifest = Get-Content (Join-Path $extDir 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$zipPath = Join-Path $PSScriptRoot "timetrack-v$version.zip"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Zip the CONTENTS of extension/ (its children land at the zip root, as required).
$items = Get-ChildItem -Path $extDir | Select-Object -ExpandProperty FullName
Compress-Archive -Path $items -DestinationPath $zipPath -CompressionLevel Optimal

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host "Created $zipPath ($sizeKb KB) for version $version"
