# deploy.ps1 - Build and deploy Mobile XR
# Usage: .\scripts\deploy.ps1 [-Platform android|ios|all] [-Profile preview|production]

param(
    [ValidateSet("android", "ios", "all")]
    [string]$Platform = "android",

    [ValidateSet("preview", "production", "development")]
    [string]$Profile = "preview",

    [switch]$Submit,
    [switch]$Local    # Local Android build without EAS
)

$ErrorActionPreference = "Stop"

function Write-Banner {
    param([string]$Text, [string]$Color = "Cyan")
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor $Color
    Write-Host "  $Text" -ForegroundColor $Color
    Write-Host "══════════════════════════════════════" -ForegroundColor $Color
    Write-Host ""
}

Write-Banner "Mobile XR Build System" "Cyan"
Write-Host "Platform : $Platform" -ForegroundColor White
Write-Host "Profile  : $Profile" -ForegroundColor White
Write-Host "Submit   : $Submit" -ForegroundColor White
Write-Host ""

# Validate EAS login
Write-Host "▶ Checking EAS auth..." -ForegroundColor Yellow
$easWhoami = eas whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Not logged in. Running eas login..." -ForegroundColor Yellow
    eas login
}
Write-Host "  ✓ Logged in as: $easWhoami" -ForegroundColor Green

# Android local build (no cloud)
if ($Local -and ($Platform -eq "android" -or $Platform -eq "all")) {
    Write-Banner "Building Android APK Locally" "Yellow"
    
    # Check Java
    try { java -version 2>&1 | Out-Null } catch {
        Write-Host "✗ Java not found! Install JDK 17 from https://adoptium.net" -ForegroundColor Red
        exit 1
    }
    
    # Check Android SDK
    if (-not $env:ANDROID_HOME) {
        Write-Host "⚠ ANDROID_HOME not set. Set it to your Android SDK path." -ForegroundColor Yellow
    }

    Write-Host "Building local APK..." -ForegroundColor Yellow
    npx expo run:android --variant release
    Write-Host "✓ APK built" -ForegroundColor Green
}

# EAS Cloud build
if (-not $Local) {
    if ($Platform -eq "android" -or $Platform -eq "all") {
        Write-Banner "Building Android via EAS Cloud" "Yellow"
        $cmd = "eas build --platform android --profile $Profile --non-interactive"
        if ($Submit) { $cmd += " --auto-submit" }
        Invoke-Expression $cmd
        Write-Host "✓ Android build submitted to EAS" -ForegroundColor Green
    }

    if ($Platform -eq "ios" -or $Platform -eq "all") {
        Write-Banner "Building iOS via EAS Cloud (no Mac needed!)" "Magenta"
        Write-Host "Note: iOS build requires Apple Developer account ($99/year)" -ForegroundColor Yellow
        Write-Host "      First time: EAS will guide through certificate setup" -ForegroundColor Yellow
        Write-Host ""
        
        $cmd = "eas build --platform ios --profile $Profile --non-interactive"
        if ($Submit) { $cmd += " --auto-submit" }
        Invoke-Expression $cmd
        Write-Host "✓ iOS build submitted to EAS" -ForegroundColor Green
    }
}

# Check build status
Write-Host ""
Write-Host "▶ Checking build status..." -ForegroundColor Yellow
eas build:list --limit 3

Write-Banner "Build Complete!" "Green"
Write-Host "Monitor builds at: https://expo.dev/accounts/YOUR_USERNAME/projects/mobile-xr/builds" -ForegroundColor Cyan
Write-Host ""
