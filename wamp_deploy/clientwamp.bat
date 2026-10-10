@echo off
REM ============================================================================
REM RÉCEPTION SALFA - Lanceur Unique Universel (clientwamp.bat)
REM ============================================================================
REM - UN SEUL BOUTON pour tout gérer :
REM   * Détecte automatiquement le serveur WAMP (localhost ou réseau local)
REM   * Configure l'imprimante thermique 80mm par défaut pour le mode kiosque
REM   * Lance directement l'application en plein écran avec impression directe
REM - Raccourcis clavier au démarrage rapide (2s) :
REM   * [Entrée] ou attente : Lancement immédiat
REM   * [P] ou [2] : Choisir l'imprimante ticket / reçus 80mm
REM   * [S] ou [3] : Reconfigurer l'adresse IP du serveur
REM ============================================================================

REM ----------------------------------------------------------------------------
REM 0. GARDE-FOU : relance le script dans un sous-processus si double-clic
REM ----------------------------------------------------------------------------
if /i not "%~1"=="__salfa_run__" (
    cmd /d /c ""%~f0" __salfa_run__ %*"
    if errorlevel 1 (
        echo.
        echo ============================================================================
        echo   Une erreur est survenue lors du lancement de RÉCEPTION SALFA.
        echo   Appuyez sur une touche pour fermer...
        echo ============================================================================
        pause >nul
    )
    exit /b
)
shift

setlocal EnableExtensions EnableDelayedExpansion
title RÉCEPTION SALFA - Système de Gestion Hospitalière

set "CONFIG_DIR=%LOCALAPPDATA%\ReceptionSalfa"
set "IP_FILE=%CONFIG_DIR%\server_ip.txt"
set "PRINTER_FILE=%CONFIG_DIR%\printer_name.txt"
set "KIOSK_PROFILE=%CONFIG_DIR%\KioskProfile"

if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%" >nul 2>&1

REM Localisation de PowerShell
set "PS_EXE="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not defined PS_EXE (
    where powershell.exe >nul 2>&1
    if !ERRORLEVEL! EQU 0 set "PS_EXE=powershell.exe"
)

REM Préparation du script PowerShell de détection
set "PS_SCRIPT=%~dp0detect_server.ps1"
if not exist "%PS_SCRIPT%" (
    set "SALFA_SELF=%~f0"
    set "PS_SCRIPT=%TEMP%\salfa_detect_%RANDOM%.ps1"
    set "TMP_PS=1"
    if defined PS_EXE (
        "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:SALFA_SELF); $m='#SALFA'+'_PS_BEGIN'; $i=$t.IndexOf($m); if ($i -lt 0) { exit 1 }; [IO.File]::WriteAllText($env:PS_SCRIPT, $t.Substring($i+$m.Length))" >nul 2>&1
    )
)

REM ----------------------------------------------------------------------------
REM OPTIONS EN LIGNE DE COMMANDE
REM ----------------------------------------------------------------------------
if /i "%~1"=="--imprimante" goto :action_select_printer
if /i "%~1"=="--printer" goto :action_select_printer
if /i "%~1"=="--choix-imprimante" goto :action_select_printer
if /i "%~1"=="-i" goto :action_select_printer
if /i "%~1"=="-p" goto :action_select_printer
if /i "%~1"=="--reset" goto :action_reset_ip
if /i "%~1"=="--reset-ip" goto :action_reset_ip
if /i "%~1"=="-c" goto :action_reset_ip

set "PRINT_DIALOG="
if /i "%~1"=="--dialogue" set "PRINT_DIALOG=1"
if /i "%~1"=="--choix" set "PRINT_DIALOG=1"
if /i "%~1"=="-d" set "PRINT_DIALOG=1"

REM ----------------------------------------------------------------------------
REM 1. DÉTECTION RAPIDE DU SERVEUR LOCAL (SERVEUR PC)
REM ----------------------------------------------------------------------------
set "LOCAL_SERVER_FOUND="

REM Test 1 : Apache en cours d'exécution localement ?
tasklist /fi "imagename eq httpd.exe" 2>nul | findstr /i "httpd.exe" >nul
if !ERRORLEVEL! EQU 0 set "LOCAL_SERVER_FOUND=1"

REM Test 2 : Port 80 en écoute locale ?
if not defined LOCAL_SERVER_FOUND (
    netstat -ano 2>nul | findstr /r ":80 .*LISTENING" >nul
    if !ERRORLEVEL! EQU 0 set "LOCAL_SERVER_FOUND=1"
)

REM Test 3 : Dossier WAMP standard sur le poste ?
if not defined LOCAL_SERVER_FOUND (
    if exist "C:\wamp64\bin\apache" set "LOCAL_SERVER_FOUND=1"
    if exist "C:\wamp\bin\apache" set "LOCAL_SERVER_FOUND=1"
    if exist "%~dp0api\config.php" set "LOCAL_SERVER_FOUND=1"
)

REM ----------------------------------------------------------------------------
REM 2. AFFICHAGE DE L'ACCUEIL & MENU RAPIDE (UN SEUL BOUTON)
REM ----------------------------------------------------------------------------
:accueil_menu
cls
echo ============================================================================
echo   RÉCEPTION SALFA - SYSTÈME DE GESTION HOSPITALIÈRE
echo ============================================================================
echo.

REM Afficher l'imprimante configurée
if defined PS_EXE (
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -showPrinter 2>nul
) else (
    if exist "%PRINTER_FILE%" (
        set /p SAVED_PRINTER=<"%PRINTER_FILE%"
        echo   Imprimante ticket 80mm : !SAVED_PRINTER!
    )
)

if defined LOCAL_SERVER_FOUND (
    echo   Serveur WAMP           : localhost (Serveur local détecté)
) else (
    if exist "%IP_FILE%" (
        set /p SAVED_IP=<"%IP_FILE%"
        if defined SAVED_IP echo   Serveur WAMP           : !SAVED_IP!
    )
)
echo ============================================================================
echo.
echo   [Entrée] Lancer RÉCEPTION SALFA (Mode Kiosque / Impression directe 80mm)
echo   [P]      Choisir l'imprimante ticket / reçus par défaut
echo   [S]      Reconfigurer l'adresse IP du serveur WAMP
echo.
echo   Démarrage automatique dans 2 secondes...
echo.

REM Attente 2 secondes avec choix rapide
choice /c 1PS /t 2 /d 1 /n >nul 2>&1
if errorlevel 3 goto :action_reset_ip
if errorlevel 2 goto :action_select_printer
goto :demarrer_app

REM ----------------------------------------------------------------------------
REM ACTION : CHOISIR L'IMPRIMANTE TICKET 80MM
REM ----------------------------------------------------------------------------
:action_select_printer
echo.
echo ============================================================================
echo   Configuration de l'imprimante ticket / reçus
echo ============================================================================
if defined PS_EXE (
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -selectPrinter
) else (
    echo PowerShell n'est pas disponible pour lister les imprimantes.
)
echo.
echo Appuyez sur une touche pour démarrer RÉCEPTION SALFA...
pause >nul
goto :demarrer_app

REM ----------------------------------------------------------------------------
REM ACTION : RÉINITIALISER L'IP DU SERVEUR
REM ----------------------------------------------------------------------------
:action_reset_ip
if exist "%IP_FILE%" del /f /q "%IP_FILE%" >nul 2>&1
set "LOCAL_SERVER_FOUND="
echo.
echo Configuration IP réinitialisée.
echo.
goto :saisie_ip

REM ----------------------------------------------------------------------------
REM DÉMARRAGE DE L'APPLICATION
REM ----------------------------------------------------------------------------
:demarrer_app
set "SERVER_HOST="

REM 1. Si nous sommes sur le serveur local, utiliser directement localhost
if defined LOCAL_SERVER_FOUND (
    set "SERVER_HOST=localhost"
    >"%IP_FILE%" echo localhost
    goto :lancer
)

REM 2. Sinon, vérifier la dernière IP mémorisée si elle fonctionne
if exist "%IP_FILE%" (
    set /p MEM_IP=<"%IP_FILE%"
    if defined MEM_IP (
        set "SERVER_HOST=!MEM_IP!"
        goto :lancer
    )
)

REM 3. Recherche réseau via PowerShell
echo [1/3] Recherche du serveur WAMP sur le réseau...
set "DETECTED_IP="
set "OUT_FILE=%TEMP%\salfa_detected_ip_%RANDOM%.txt"
if exist "%OUT_FILE%" del /f /q "%OUT_FILE%" >nul 2>&1

if defined PS_EXE (
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" "%IP_FILE%" > "%OUT_FILE%" 2>nul
    if exist "%OUT_FILE%" (
        set /p DETECTED_IP=<"%OUT_FILE%"
        del /f /q "%OUT_FILE%" >nul 2>&1
    )
)

if defined TMP_PS if exist "%PS_SCRIPT%" del /f /q "%PS_SCRIPT%" >nul 2>&1

if defined DETECTED_IP (
    set "DETECTED_IP=!DETECTED_IP: =!"
    if defined DETECTED_IP (
        set "SERVER_HOST=!DETECTED_IP!"
        echo        OK : serveur détecté à l'adresse !SERVER_HOST!
        >"%IP_FILE%" echo !SERVER_HOST!
        goto :lancer
    )
)

REM ----------------------------------------------------------------------------
REM SAISIE MANUELLE SI NON DÉTECTÉ
REM ----------------------------------------------------------------------------
:saisie_ip
echo.
echo ============================================================================
echo   Configuration de l'adresse du serveur WAMP
echo ============================================================================
echo.
echo Entrez l'adresse IP du serveur WAMP (ou 'localhost' si vous êtes sur le serveur).
echo Exemples :
echo   - Si vous êtes sur le PC serveur : localhost
echo   - Si vous êtes sur un poste client : 192.168.1.50
echo.
set "USER_IP="
set /p "USER_IP=Adresse IP du serveur : "
if not defined USER_IP goto :saisie_ip

set "USER_IP=!USER_IP: =!"
set "USER_IP=!USER_IP:http://=!"
set "USER_IP=!USER_IP:https://=!"
set "USER_IP=!USER_IP:/reception-salfa/=!"
set "USER_IP=!USER_IP:/reception-salfa=!"
set "USER_IP=!USER_IP:/reception_salfa/=!"
set "USER_IP=!USER_IP:/reception_salfa=!"
set "USER_IP=!USER_IP:/=!"

if not defined USER_IP goto :saisie_ip
set "SERVER_HOST=!USER_IP!"
>"%IP_FILE%" echo !SERVER_HOST!

REM ----------------------------------------------------------------------------
REM LANCEMENT DU NAVIGATEUR EN MODE KIOSQUE
REM ----------------------------------------------------------------------------
:lancer
set "APP_URL=http://!SERVER_HOST!/reception-salfa/"
echo.
echo [2/3] Connexion à : !APP_URL!

set "BROWSER_EXE="

REM Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

REM Microsoft Edge
if not defined BROWSER_EXE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER_EXE (
    where chrome.exe >nul 2>&1
    if !ERRORLEVEL! EQU 0 set "BROWSER_EXE=chrome.exe"
)
if not defined BROWSER_EXE (
    where msedge.exe >nul 2>&1
    if !ERRORLEVEL! EQU 0 set "BROWSER_EXE=msedge.exe"
)

echo [3/3] Lancement de RÉCEPTION SALFA en mode Kiosque 80mm...
if defined BROWSER_EXE (
    if defined PRINT_DIALOG (
        start "RÉCEPTION SALFA" "!BROWSER_EXE!" --user-data-dir="%KIOSK_PROFILE%" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --new-window --start-fullscreen --app="!APP_URL!"
    ) else (
        start "RÉCEPTION SALFA" "!BROWSER_EXE!" --user-data-dir="%KIOSK_PROFILE%" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --kiosk-printing --new-window --start-fullscreen --app="!APP_URL!"
    )
) else (
    start "" "!APP_URL!"
)

echo.
echo ============================================================================
echo   RÉCEPTION SALFA est prêt !
echo   - Pour changer l'imprimante à tout moment : relancer clientwamp.bat puis touche P
echo   - Pour changer l'adresse IP              : relancer clientwamp.bat puis touche S
echo ============================================================================
timeout /t 2 >nul 2>&1
exit /b 0
