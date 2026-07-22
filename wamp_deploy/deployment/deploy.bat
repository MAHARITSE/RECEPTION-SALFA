@echo off
REM ============================================================
REM RECEPTION SALFA - Script de déploiement WAMP
REM ============================================================
REM Ce script automatise le déploiement de l'application
REM sur un serveur WAMP local ou réseau
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo    RECEPTION SALFA - DEPLOIEMENT WAMP
echo ============================================================
echo.

REM === CONFIGURATION ===
set "PROJECT_NAME=reception-salfa"
set "WAMP_PATH=C:\wamp64"
set "WEB_ROOT=%WAMP_PATH%\www"
set "TARGET_PATH=%WEB_ROOT%\%PROJECT_NAME%"

REM Couleurs (si supporté)
color 0A

REM === VÉRIFICATIONS PRÉALABLES ===

echo [1/6] Verification des prerequisites...

REM Vérifier Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERREUR] Node.js n'est pas installe. Installez Node.js d'abord.
    echo   Telechargeable sur: https://nodejs.org/
    pause
    exit /b 1
)
echo   [OK] Node.js detecte

REM Vérifier npm
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERREUR] npm n'est pas installe.
    pause
    exit /b 1
)
echo   [OK] npm detecte

REM Vérifier WAMP
if not exist "%WAMP_PATH%" (
    echo   [ERREUR] WAMP n'est pas installe dans %WAMP_PATH%
    echo   Modifiez la variable WAMP_PATH dans ce script si necessaire.
    pause
    exit /b 1
)
echo   [OK] WAMP detecte

echo.

REM === INSTALLATION DES DÉPENDANCES ===

echo [2/6] Installation des dependances npm...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo   [ERREUR] Echec de l'installation des dependances.
    pause
    exit /b 1
)
echo   [OK] Dependances installees

echo.

REM === BUILD DE L'APPLICATION ===

echo [3/6] Construction de l'application (vite build)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo   [ERREUR] Echec de la construction.
    pause
    exit /b 1
)
echo   [OK] Application construite

echo.

REM === CRÉATION DU DOSSIER DE DÉPLOIEMENT ===

echo [4/6] Preparation du dossier de deploiement...

REM Créer le dossier cible
if not exist "%TARGET_PATH%" (
    echo   Creation du dossier %TARGET_PATH%...
    mkdir "%TARGET_PATH%"
)

REM Copier les fichiers du dossier dist/
echo   Copie des fichiers de dist/...
xcopy /E /I /Y /Q "%CD%\dist\*" "%TARGET_PATH%\" >nul 2>&1

REM Copier le fichier .htaccess
if exist "%CD%\wamp_deploy\.htaccess" (
    copy /Y "%CD%\wamp_deploy\.htaccess" "%TARGET_PATH%\" >nul 2>&1
    echo   [OK] .htaccess copie
)

REM Copier les fichiers de configuration
if not exist "%TARGET_PATH%\config" (
    mkdir "%TARGET_PATH%\config"
)
if exist "%CD%\wamp_deploy\config\db_config.php" (
    copy /Y "%CD%\wamp_deploy\config\db_config.php" "%TARGET_PATH%\config\" >nul 2>&1
    echo   [OK] Configuration base de donnees copiee
)

echo   [OK] Dossier de deploiement pret

echo.

REM === COPIE DE LA CONFIGURATION APACHE ===

echo [5/6] Configuration Apache...

set "APACHE_CONF=%WAMP_PATH%\conf\extra\reception-salfa.conf"
set "APACHE_CONF_SOURCE=%CD%\wamp_deploy\apache\reception-salfa.conf"

if exist "%APACHE_CONF_SOURCE%" (
    echo   Copie de la configuration VirtualHost...
    
    REM Demander confirmation pour écraser
    set "OVERWRITE="
    if exist "%APACHE_CONF%" (
        set /p OVERWRITE="   Le fichier de configuration existe. Ecraser? (O/N): "
        if /i not "!OVERWRITE!"=="O" (
            echo   Configuration Apache non modifiee.
        ) else (
            copy /Y "%APACHE_CONF_SOURCE%" "%APACHE_CONF%" >nul 2>&1
            echo   [OK] Configuration Apache mise a jour
        )
    ) else (
        copy /Y "%APACHE_CONF_SOURCE%" "%APACHE_CONF%" >nul 2>&1
        echo   [OK] Configuration Apache copiee
    )
    
    echo.
    echo   ATTENTION: Pour activer la configuration Apache:
    echo   1. Editez %WAMP_PATH%\bin\apache\apache2.4.x\conf\httpd.conf
    echo   2. Ajoutez cette ligne: Include conf/extra/reception-salfa.conf
    echo   3. Redemarrez WAMP
) else (
    echo   [INFO] Fichier de configuration Apache non trouve.
)

echo.

REM === INFORMATIONS FINALES ===

echo [6/6] Informations de deploiement...

echo.
echo ============================================================
echo    DEPLOIEMENT TERMINE AVEC SUCCES !
echo ============================================================
echo.
echo    URL Locale:       http://localhost/reception-salfa
echo    URL Réseau:       http://192.168.1.50/reception-salfa
echo    Dossier Web:     %TARGET_PATH%
echo.
echo    Prochaines étapes:
echo    1. Importez la base de donnees (voir wamp_deploy/database/)
echo    2. Configurez Apache (si pas encore fait)
echo    3. Redemarrez les services WAMP
echo    4. Accédez à l'application via le navigateur
echo.
echo    Données de connexion par défaut:
echo    - Administrateur: admin / admin123
echo    - Médecin:         dr_kalala / admin123
echo    - Caissier:        caisse1 / admin123
echo.
echo ============================================================

REM Proposer de lancer le navigateur
set "OPEN_BROWSER="
set /p OPEN_BROWSER="Voulez-vous ouvrir l'application dans le navigateur? (O/N): "
if /i "!OPEN_BROWSER!"=="O" (
    start chrome --kiosk-printing http://localhost/reception-salfa
    if %ERRORLEVEL% NEQ 0 (
        start msedge --kiosk-printing http://localhost/reception-salfa
    )
)

echo.
pause
endlocal
