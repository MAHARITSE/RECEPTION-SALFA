@echo off
setlocal EnableExtensions
title RECEPTION SALFA - Impression directe

REM ============================================================================
REM RECEPTION SALFA - Lancement local avec impression directe Chrome/Edge
REM ============================================================================
REM Important : --kiosk-printing n'est pris en compte que si le navigateur est
REM demarre avec ce flag. Si une ancienne instance Chrome/Edge reutilise le meme
REM profil sans ce flag, l'aperçu d'impression reste affiche.
REM Ce lanceur force un profil dedie pour RECEPTION SALFA + ferme les anciennes
REM fenetres afin que l'impression silencieuse soit active.
REM ============================================================================

set "APP_URL=http://localhost:5173"
set "KIOSK_PROFILE=%LOCALAPPDATA%\ReceptionSalfa\KioskProfile"

echo [1/4] Verification des dependances...
if not exist "node_modules" (
    echo node_modules manquant. Lancement de setup.bat...
    call setup.bat
)

echo [2/4] Fermeture des anciennes instances Chrome/Edge...
taskkill /f /im chrome.exe >nul 2>&1
taskkill /f /im msedge.exe >nul 2>&1

echo [3/4] Demarrage du serveur de developpement...
start "RECEPTION SALFA - Serveur" cmd /k "npm run dev"

echo Attente de l'initialisation du serveur (4 secondes)...
timeout /t 4 /nobreak >nul

echo [4/4] Ouverture du navigateur en mode IMPRESSION DIRECTE (--kiosk-printing)...
call :open_browser "%APP_URL%"
if errorlevel 1 goto :erreur

goto :fin

:open_browser
set "URL=%~1"
set "CHROME_EXE="
set "EDGE_EXE="

REM Google Chrome - chemins standards Windows 64/32 bits
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
    start "RECEPTION SALFA - Chrome" "%CHROME_EXE%" --user-data-dir="%KIOSK_PROFILE%\Chrome" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

REM Chrome dans le PATH, si installe autrement
where chrome >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start "RECEPTION SALFA - Chrome" chrome --user-data-dir="%KIOSK_PROFILE%\Chrome" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

REM Microsoft Edge - present par defaut sur Windows 10/11
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if defined EDGE_EXE (
    echo Chrome introuvable. Tentative avec Microsoft Edge...
    start "RECEPTION SALFA - Edge" "%EDGE_EXE%" --user-data-dir="%KIOSK_PROFILE%\Edge" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

where msedge >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Chrome introuvable. Tentative avec Microsoft Edge...
    start "RECEPTION SALFA - Edge" msedge --user-data-dir="%KIOSK_PROFILE%\Edge" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

exit /b 1

:erreur
echo.
echo ERREUR : Aucun navigateur Chrome/Edge compatible n'a ete trouve.
echo Installez Google Chrome ou utilisez Microsoft Edge.
echo.
pause
exit /b 1

:fin
echo.
echo Application lancee avec succes !
echo Les tickets doivent partir directement sur l'imprimante Windows par defaut.
echo Si l'aperçu s'affiche encore, verifiez que l'imprimante par defaut n'est pas "Microsoft Print to PDF".
echo.
pause
