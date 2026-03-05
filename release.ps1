# release.ps1 — Windows PowerShell
# Использование: .\release.ps1

$pkg = Get-Content package.json | ConvertFrom-Json
$current = $pkg.version
Write-Host "Текущая версия: $current"

$parts = $current.Split('.')
$newPatch = [int]$parts[2] + 1
$suggested = "$($parts[0]).$($parts[1]).$newPatch"

$input_ver = Read-Host "Новая версия [$suggested]"
if ([string]::IsNullOrWhiteSpace($input_ver)) { $input_ver = $suggested }

$input_desc = Read-Host "Описание изменений"
if ([string]::IsNullOrWhiteSpace($input_desc)) { $input_desc = "Release $input_ver" }

$pkg.version = $input_ver
$pkg | ConvertTo-Json -Depth 10 | Set-Content package.json

git add -A
git commit -m "release: v$input_ver — $input_desc"
git push
git tag "v$input_ver"
git push origin "v$input_ver"

Write-Host "Готово! Версия v$input_ver опубликована."
