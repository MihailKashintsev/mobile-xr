# setup-github.ps1 - Initialize GitHub repository
# Usage: .\scripts\setup-github.ps1 -Username "your_github_username"

param(
    [Parameter(Mandatory=$true)]
    [string]$Username,
    [string]$RepoName = "mobile-xr"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🐙 Setting up GitHub repository..." -ForegroundColor Cyan
Write-Host ""

# Check GitHub CLI
try {
    gh --version | Out-Null
    Write-Host "✓ GitHub CLI found" -ForegroundColor Green
} catch {
    Write-Host "✗ GitHub CLI not found!" -ForegroundColor Red
    Write-Host "  Install from: https://cli.github.com/en/manual/installation" -ForegroundColor Yellow
    Write-Host "  Windows: winget install GitHub.cli" -ForegroundColor White
    exit 1
}

# Login
Write-Host "▶ Logging into GitHub..." -ForegroundColor Yellow
gh auth login

# Create .gitignore
Write-Host "▶ Creating .gitignore..." -ForegroundColor Yellow
@"
# Dependencies
node_modules/
.pnp
.pnp.js

# Expo
.expo/
dist/
web-build/
expo-env.d.ts

# Native
android/
ios/

# Secrets
secrets/
*.keystore
google-service-account.json
.env
.env.local

# Build artifacts
*.apk
*.ipa
*.aab
builds/

# Misc
.DS_Store
*.pem
npm-debug.log*
"@ | Set-Content ".gitignore"

# Init git
if (-not (Test-Path ".git")) {
    git init -b main
    Write-Host "✓ Git initialized" -ForegroundColor Green
}

# Update app.json
Write-Host "▶ Updating app.json with repo info..." -ForegroundColor Yellow
$appJson = Get-Content "app.json" -Raw | ConvertFrom-Json
$appJson.expo.extra.githubRepo = "$Username/$RepoName"
$appJson | ConvertTo-Json -Depth 10 | Set-Content "app.json"
Write-Host "  ✓ githubRepo set to: $Username/$RepoName" -ForegroundColor Green

# Create repo on GitHub
Write-Host "▶ Creating GitHub repository: $Username/$RepoName..." -ForegroundColor Yellow
gh repo create $RepoName `
    --public `
    --description "📱 Mobile XR - AR/VR with hand tracking for iOS & Android" `
    --homepage "https://github.com/$Username/$RepoName"

# Add remote
git remote remove origin 2>$null
git remote add origin "https://github.com/$Username/$RepoName.git"

# Add secrets for CI/CD
Write-Host ""
Write-Host "▶ Setting up GitHub Actions secrets..." -ForegroundColor Yellow
Write-Host "  You need an EXPO_TOKEN from https://expo.dev/accounts/YOUR_NAME/settings/access-tokens" -ForegroundColor White
$expoToken = Read-Host "  Enter your EXPO_TOKEN (or press Enter to skip)"
if ($expoToken -ne "") {
    gh secret set EXPO_TOKEN --body $expoToken
    Write-Host "  ✓ EXPO_TOKEN secret added" -ForegroundColor Green
}

# Initial commit
Write-Host "▶ Creating initial commit..." -ForegroundColor Yellow
git add .
git commit -m "feat: initial Mobile XR project setup

- AR/VR mode with camera passthrough
- Real-time hand tracking (TensorFlow.js)
- 3D floating panels (Three.js)
- Gyroscope head tracking
- Auto-update from GitHub releases
- EAS Build for iOS without Mac"

git push -u origin main

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║      GitHub Repository Ready! ✓           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 Repository: https://github.com/$Username/$RepoName" -ForegroundColor Cyan
Write-Host "🔗 Actions:    https://github.com/$Username/$RepoName/actions" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Create a release with .\scripts\release.ps1 -Version '1.0.0'" -ForegroundColor White
