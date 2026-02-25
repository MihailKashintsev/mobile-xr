# setup.ps1 - Initial project setup for Mobile XR
# Run: .\scripts\setup.ps1

param(
    [string]$GithubUsername = "",
    [string]$RepoName = "mobile-xr"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Mobile XR - Setup Script       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "▶ Checking dependencies..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found! Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check Git
try {
    $gitVersion = git --version
    Write-Host "  ✓ Git: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Git not found! Install from https://git-scm.com" -ForegroundColor Red
    exit 1
}

# Install EAS CLI globally
Write-Host ""
Write-Host "▶ Installing Expo & EAS CLI..." -ForegroundColor Yellow
npm install -g expo-cli eas-cli
Write-Host "  ✓ EAS CLI installed" -ForegroundColor Green

# Install project dependencies
Write-Host ""
Write-Host "▶ Installing project dependencies..." -ForegroundColor Yellow
npm install
Write-Host "  ✓ Dependencies installed" -ForegroundColor Green

# GitHub repo setup
if ($GithubUsername -ne "") {
    Write-Host ""
    Write-Host "▶ Setting up GitHub repository..." -ForegroundColor Yellow

    # Initialize git if needed
    if (-not (Test-Path ".git")) {
        git init
        Write-Host "  ✓ Git initialized" -ForegroundColor Green
    }

    # Update app.json with GitHub repo
    $appJson = Get-Content "app.json" | ConvertFrom-Json
    $appJson.expo.extra.githubRepo = "$GithubUsername/$RepoName"
    $appJson | ConvertTo-Json -Depth 10 | Set-Content "app.json"
    Write-Host "  ✓ app.json updated with repo: $GithubUsername/$RepoName" -ForegroundColor Green

    # Check GitHub CLI
    try {
        $ghVersion = gh --version
        Write-Host "  ✓ GitHub CLI found" -ForegroundColor Green

        # Create repo
        Write-Host "  Creating GitHub repository..." -ForegroundColor Yellow
        gh repo create $RepoName --public --description "Mobile XR - AR/VR experience with hand tracking" 2>$null
        
        git remote add origin "https://github.com/$GithubUsername/$RepoName.git" 2>$null
        Write-Host "  ✓ Repository created: https://github.com/$GithubUsername/$RepoName" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ GitHub CLI not found. Install from https://cli.github.com" -ForegroundColor Yellow
        Write-Host "    Manual: Create repo at https://github.com/new named '$RepoName'" -ForegroundColor Yellow
    }
}

# EAS login
Write-Host ""
Write-Host "▶ EAS Build Setup (for iOS builds without Mac)..." -ForegroundColor Yellow
Write-Host "  Logging into Expo account..." -ForegroundColor White
eas login

Write-Host ""
Write-Host "▶ Initializing EAS project..." -ForegroundColor Yellow
eas init --id

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           Setup Complete! ✓           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. .\scripts\dev.ps1            - Start dev server" -ForegroundColor Cyan
Write-Host "  2. .\scripts\build-android.ps1  - Build Android APK" -ForegroundColor Cyan
Write-Host "  3. .\scripts\build-ios.ps1      - Build iOS (cloud, no Mac needed!)" -ForegroundColor Cyan
Write-Host "  4. .\scripts\release.ps1        - Create GitHub release" -ForegroundColor Cyan
Write-Host ""
