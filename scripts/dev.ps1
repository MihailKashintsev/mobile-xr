# dev.ps1 - Start development server
# Usage: .\scripts\dev.ps1 [-Platform android|ios]

param(
    [ValidateSet("android", "ios", "web", "")]
    [string]$Platform = ""
)

Write-Host ""
Write-Host "🚀 Starting Mobile XR Dev Server..." -ForegroundColor Cyan
Write-Host ""
Write-Host "To run on device:" -ForegroundColor Yellow
Write-Host "  Android: Scan QR with Expo Go app, or press 'a'" -ForegroundColor White
Write-Host "  iPhone:  Scan QR with Camera app (iOS 16+), or press 'i'" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

if ($Platform -eq "android") {
    npx expo start --android
} elseif ($Platform -eq "ios") {
    npx expo start --ios
} else {
    npx expo start --tunnel  # --tunnel works on any network
}
