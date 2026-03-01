$ErrorActionPreference = "Stop"
Write-Host "=== Mobile XR Release ===" -ForegroundColor Cyan

$pkg = Get-Content "package.json" | ConvertFrom-Json
$current = $pkg.version
Write-Host "Current: v$current" -ForegroundColor Yellow

$inputVer = Read-Host "New version (X.Y.Z) or Enter for patch"
if ([string]::IsNullOrWhiteSpace($inputVer)) {
    $parts = $current -split "\."
    $inputVer = "$($parts[0]).$($parts[1]).$([int]$parts[2]+1)"
}
if ($inputVer -notmatch "^\d+\.\d+\.\d+$") { Write-Host "Bad format" -ForegroundColor Red; exit 1 }
$version = "v$inputVer"

$notes = Read-Host "Changes (or Enter to skip)"
if ([string]::IsNullOrWhiteSpace($notes)) { $notes = "Release $version" }

Write-Host "Will release $version — $notes"
$confirm = Read-Host "Continue? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") { exit 0 }

Write-Host "[1/5] Updating package.json..." -ForegroundColor Cyan
npm version $inputVer --no-git-tag-version --allow-same-version | Out-Null

Write-Host "[2/5] Committing..." -ForegroundColor Cyan
git add -A
git commit -m "release: $version - $notes"

Write-Host "[3/5] Pushing commit..." -ForegroundColor Cyan
git push

Write-Host "[4/5] Creating tag..." -ForegroundColor Cyan
git tag $version -m $notes

Write-Host "[5/5] Pushing tag..." -ForegroundColor Cyan
git push --tags

Write-Host "Done! Released $version" -ForegroundColor Green
Write-Host "https://github.com/MihailKashintsev/mobile-xr/actions" -ForegroundColor Cyan