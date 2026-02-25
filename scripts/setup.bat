@echo off
chcp 65001 > nul
echo ╔══════════════════════════════════════╗
echo ║     Mobile XR — первоначальная       ║
echo ║          настройка проекта           ║
echo ╚══════════════════════════════════════╝
echo.

:: Проверяем Node.js
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не установлен!
    echo Скачайте с https://nodejs.org ^(LTS версия^)
    pause
    exit /b 1
)
echo [✓] Node.js установлен

:: Проверяем Git
git --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Git не установлен!
    echo Скачайте с https://git-scm.com
    pause
    exit /b 1
)
echo [✓] Git установлен

:: Установка зависимостей
echo.
echo [→] Устанавливаю зависимости npm...
npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm install завершился с ошибкой
    pause
    exit /b 1
)
echo [✓] Зависимости установлены

:: Запрашиваем GitHub данные
echo.
set /p GITHUB_USER=Введите ваш GitHub username: 
set /p GITHUB_REPO=Введите название репозитория [mobile-xr]: 
if "%GITHUB_REPO%"=="" set GITHUB_REPO=mobile-xr

:: Обновляем main.ts с username
powershell -Command "(Get-Content src\main.ts) -replace 'YOUR_GITHUB_USERNAME', '%GITHUB_USER%' | Set-Content src\main.ts"
echo [✓] Username обновлён в main.ts

:: Инициализируем git
echo.
echo [→] Инициализирую Git репозиторий...
git init
git add .
git commit -m "feat: initial Mobile XR setup"
echo [✓] Первый коммит создан

echo.
echo ══════════════════════════════════════
echo Следующие шаги:
echo 1. Создайте репозиторий на GitHub: https://github.com/new
echo    Название: %GITHUB_REPO%
echo.
echo 2. Выполните в этой папке:
echo    git remote add origin https://github.com/%GITHUB_USER%/%GITHUB_REPO%.git
echo    git branch -M main
echo    git push -u origin main
echo.
echo 3. В GitHub Settings → Pages → Source: GitHub Actions
echo.
echo 4. Для локальной разработки: npm run dev
echo ══════════════════════════════════════
pause
