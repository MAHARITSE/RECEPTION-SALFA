@echo off
REM ============================================================================
REM RECEPTION SALFA - Lancement Impression Directe (Mode Kiosk / Silencieux)
REM ============================================================================

echo [1/3] Verification des dependances...
if not exist "node_modules" (
    echo node_modules manquant. Lancement de setup.bat...
    call setup.bat
)

echo [2/3] Demarrage du serveur de developpement...
start "" npm run dev

echo Attente de l'initialisation du serveur (4 secondes)...
timeout /t 4 /nobreak >nul

echo [3/3] Ouverture du navigateur en mode IMPRESSION DIRECTE (--kiosk-printing)...

REM Vérification des chemins standards de Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk-printing http://localhost:5173
    goto :fin
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk-printing http://localhost:5173
    goto :fin
)

REM Si Chrome n'est pas trouvé, on lance Microsoft Edge (présent par défaut sur Windows 10/11)
echo Chrome introuvable. Tentative avec Microsoft Edge...
start msedge --kiosk-printing http://localhost:5173

:fin
echo.
echo Application lancee avec succes !
echo Les tickets s'impriment directement sur l'imprimante Windows par defaut.
echo.
pause
