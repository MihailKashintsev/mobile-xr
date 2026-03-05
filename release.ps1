# release.ps1 — Windows PowerShell
param([string]$Version = "", [string]$Message = "")

$pkg = Get-Content "package.json" | ConvertFrom-Json
$current = $pkg.version
$parts = $current -split "\."
$suggested = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"

Write-Host "`nMobile XR Release Tool" -ForegroundColor Cyan
Write-Host "Текущая версия: $current" -ForegroundColor Yellow

if (-not $Version) {
    Write-Host "Новая версия [$suggested]: " -ForegroundColor Green -NoNewline
    $input = Read-Host
    $Version = if ($input -eq "") { $suggested } else { $input }
}
if (-not $Message) {
    Write-Host "Описание: " -ForegroundColor Green -NoNewline
    $Message = Read-Host
    if (-not $Message) { $Message = "Release $Version" }
}

$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"

git add -A
git commit -m "release: v$Version — $Message"
git push
git tag "v$Version"
git push origin "v$Version"

Write-Host "`nГотово! v$Version опубликована" -ForegroundColor Green
