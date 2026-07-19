@echo off
REM ============================================================================
REM RECEPTION SALFA - Lancement Impression Directe (Mode Kiosk / Silencieux)
REM ============================================================================
REM 1. Définir votre imprimante thermique comme imprimante par défaut Windows
REM 2. Lancer ce script (lancer-impression-directe.bat)
REM 3. Admin -> Tickets : cocher "Lancer l'impression automatiquement"
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
REM Tentative avec Google Chrome
start chrome --kiosk-printing http://localhost:5173
if %ERRORLEVEL% NEQ 0 (
    REM Si Chrome n'est pas disponible, tentative avec Microsoft Edge
    start msedge --kiosk-printing http://localhost:5173
)

echo.
echo Application lancee avec succes !
echo Les tickets s'impriment directement sur l'imprimante Windows par defaut.
echo.
pause
