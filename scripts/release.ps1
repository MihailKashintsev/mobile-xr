# release.ps1 - Create a GitHub release with built artifacts
# Usage: .\scripts\release.ps1 -Version "1.2.0" -Notes "Bug fixes and improvements"
# Requires: GitHub CLI (gh) - install from https://cli.github.com

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [string]$Notes = "",
    [switch]$Draft,
    [switch]$Prerelease,
    [string]$ApkPath = "",  # Path to .apk file, auto-finds if empty
    [string]$IpaPath = ""   # Path to .ipa file
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║    Mobile XR - Release Creator     ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# Validate version format
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "✗ Version must be in format: X.Y.Z (e.g. 1.2.0)" -ForegroundColor Red
    exit 1
}

$tag = "v$Version"

# Check GitHub CLI
try {
    gh --version | Out-Null
} catch {
    Write-Host "✗ GitHub CLI not found!" -ForegroundColor Red
    Write-Host "  Install from: https://cli.github.com" -ForegroundColor Yellow
    exit 1
}

# Check logged in
$ghUser = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged into GitHub CLI. Running gh auth login..." -ForegroundColor Yellow
    gh auth login
}

# Update version in app.json and package.json
Write-Host "▶ Updating version to $Version..." -ForegroundColor Yellow

$appJson = Get-Content "app.json" -Raw | ConvertFrom-Json
$appJson.expo.version = $Version
$versionCode = [int]($Version -replace '\.', '')
$appJson.expo.android.versionCode = $versionCode
$appJson.expo.ios.buildNumber = $Version
$appJson | ConvertTo-Json -Depth 10 | Set-Content "app.json"

$pkgJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$pkgJson.version = $Version
$pkgJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"

Write-Host "  ✓ app.json and package.json updated" -ForegroundColor Green

# Git commit and tag
Write-Host "▶ Creating git commit and tag..." -ForegroundColor Yellow
git add app.json package.json
git commit -m "chore: bump version to $Version"
git tag $tag
git push origin main
git push origin $tag
Write-Host "  ✓ Pushed tag $tag" -ForegroundColor Green

# Find build artifacts
$assets = @()

if ($ApkPath -ne "" -and (Test-Path $ApkPath)) {
    $assets += $ApkPath
    Write-Host "  ✓ Found APK: $ApkPath" -ForegroundColor Green
} else {
    # Auto-find APK in common locations
    $apkSearch = @(
        "android/app/build/outputs/apk/release/*.apk",
        "*.apk",
        "builds/*.apk"
    )
    foreach ($pattern in $apkSearch) {
        $found = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $newName = "mobile-xr-$Version-android.apk"
            Copy-Item $found.FullName $newName
            $assets += $newName
            Write-Host "  ✓ Found APK: $($found.Name)" -ForegroundColor Green
            break
        }
    }
}

if ($IpaPath -ne "" -and (Test-Path $IpaPath)) {
    $assets += $IpaPath
    Write-Host "  ✓ Found IPA: $IpaPath" -ForegroundColor Green
}

# Build release notes
$releaseNotes = if ($Notes -ne "") { $Notes } else {
@"
## Mobile XR v$Version

### What's New
- Performance improvements
- Bug fixes

### Installation
**Android:** Download the APK below and install (enable "Unknown sources" in settings)
**iOS:** Download via TestFlight or direct IPA install

### Requirements
- Android 10+ 
- iOS 15+ (iPhone 14 Pro recommended for best performance)
- Good lighting for hand tracking
"@
}

# Create release
Write-Host ""
Write-Host "▶ Creating GitHub release $tag..." -ForegroundColor Yellow

$releaseArgs = @(
    "release", "create", $tag,
    "--title", "Mobile XR $tag",
    "--notes", $releaseNotes
)

if ($Draft)      { $releaseArgs += "--draft" }
if ($Prerelease) { $releaseArgs += "--prerelease" }

# Add assets
foreach ($asset in $assets) {
    $releaseArgs += $asset
}

& gh @releaseArgs

Write-Host ""
Write-Host "╔════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        Release Created! ✓           ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 Release URL:" -ForegroundColor Cyan
gh release view $tag --json url -q .url
Write-Host ""
Write-Host "Users will be notified of the update automatically on next app launch." -ForegroundColor White
