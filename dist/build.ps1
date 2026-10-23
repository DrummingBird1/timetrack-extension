# Builds a clean Chrome Web Store upload zip from the extension/ folder.
# The zip contains ONLY the runtime files, with manifest.json at the zip root.
# Output: dist/timetrack-v<version>.zip
# Usage:  pwsh dist/build.ps1

$ErrorActionPreference = 'Stop'
# dist/build.ps1  ->  project root is one level up
$root = Split-Path -Parent $PSScriptRoot
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

# Tidy up: zips of earlier versions move to archive/old-builds/ (git-ignored build output; the
# official copy of every release is attached to its GitHub Release). Never overwrites a file.
$archiveDir = Join-Path $root 'archive/old-builds'
$older = Get-ChildItem -Path $PSScriptRoot -Filter 'timetrack-v*.zip' | Where-Object { $_.FullName -ne $zipPath }
if ($older) { New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null }
foreach ($old in $older) {
  if (Test-Path (Join-Path $archiveDir $old.Name)) {
    Write-Warning "archive/old-builds/ already has $($old.Name); left $($old.Name) in dist/"
  } else {
    Move-Item -Path $old.FullName -Destination $archiveDir
    Write-Host "Archived $($old.Name) -> archive/old-builds/"
  }
}
