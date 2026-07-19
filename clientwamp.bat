@echo off
setlocal EnableExtensions
title RECEPTION SALFA - Client reseau impression directe

REM ============================================================================
REM RECEPTION SALFA - Client reseau WAMP avec impression directe Chrome/Edge
REM ============================================================================
REM 1) Remplacez l'IP ci-dessous par l'IP reelle du serveur WAMP.
REM 2) Gardez une URL simple : http://IP/reception-salfa
REM    Ne pas mettre le format Markdown [http://...](http://...).
REM 3) --kiosk-printing fonctionne avec le profil dedie RECEPTION SALFA
REM    sans fermer les autres fenetres ou sessions de votre navigateur.
REM ============================================================================

set "APP_URL=http://192.168.1.50/reception-salfa"
set "KIOSK_PROFILE=%LOCALAPPDATA%\ReceptionSalfa\KioskProfile"

echo Lancement de RECEPTION SALFA sur le reseau...
echo Ouverture d'une nouvelle session en mode IMPRESSION DIRECTE (--kiosk-printing)...
call :open_browser "%APP_URL%"
if errorlevel 1 goto :erreur

echo.
echo Application lancee avec succes dans une nouvelle session !
echo Les tickets doivent partir directement sur l'imprimante Windows par defaut.
echo.
goto :fin

:open_browser
set "URL=%~1"
set "CHROME_EXE="
set "EDGE_EXE="

REM Google Chrome - chemins standards Windows 64/32 bits
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
    start "RECEPTION SALFA - Chrome" "%CHROME_EXE%" --user-data-dir="%KIOSK_PROFILE%\Chrome" --new-window --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

REM Chrome dans le PATH, si installe autrement
where chrome >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start "RECEPTION SALFA - Chrome" chrome --user-data-dir="%KIOSK_PROFILE%\Chrome" --new-window --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

REM Microsoft Edge - present par defaut sur Windows 10/11
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if defined EDGE_EXE (
    echo Chrome introuvable. Tentative avec Microsoft Edge...
    start "RECEPTION SALFA - Edge" "%EDGE_EXE%" --user-data-dir="%KIOSK_PROFILE%\Edge" --new-window --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
    exit /b 0
)

where msedge >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Chrome introuvable. Tentative avec Microsoft Edge...
    start "RECEPTION SALFA - Edge" msedge --user-data-dir="%KIOSK_PROFILE%\Edge" --new-window --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --app="%URL%"
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
pause
