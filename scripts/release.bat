@echo off
chcp 65001 > nul
echo ╔══════════════════════════════════════╗
echo ║     Mobile XR — публикация релиза    ║
echo ╚══════════════════════════════════════╝
echo.

:: Получаем текущую версию
for /f "tokens=2 delims=:, " %%a in ('findstr /r "\"version\"" package.json') do (
    set VERSION=%%a
    goto :found
)
:found
set VERSION=%VERSION:"=%

echo Текущая версия: %VERSION%
echo.
set /p NEW_VERSION=Новая версия (enter = оставить %VERSION%): 
if "%NEW_VERSION%"=="" set NEW_VERSION=%VERSION%

:: Обновляем package.json
powershell -Command "(Get-Content package.json) -replace '\"version\": \"%VERSION%\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content package.json"
echo [✓] Версия обновлена: %NEW_VERSION%

:: Сборка для проверки
echo.
echo [→] Проверочная сборка...
call npm run build
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сборка не прошла! Исправьте ошибки.
    pause
    exit /b 1
)
echo [✓] Сборка успешна

:: Git commit + tag + push
echo.
echo [→] Создаю коммит и тег v%NEW_VERSION%...
git add -A
git commit -m "release: v%NEW_VERSION%"
git tag v%NEW_VERSION%
git push origin main --tags

echo.
echo ══════════════════════════════════════
echo [✓] Релиз v%NEW_VERSION% опубликован!
echo.
echo GitHub Actions автоматически:
echo  • Соберёт проект
echo  • Создаст GitHub Release
echo  • Задеплоит на GitHub Pages
echo.
echo Проверьте прогресс на:
echo https://github.com/.../.../actions
echo ══════════════════════════════════════
pause
