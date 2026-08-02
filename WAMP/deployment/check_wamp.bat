@echo off
REM ============================================================
REM RECEPTION SALFA - Vérification Installation WAMP
REM ============================================================
REM Exécutez ce script avant le déploiement pour vérifier
REM que votre serveur WAMP est correctement configuré
REM ============================================================

setlocal enabledelayedexpansion

color 0A

echo.
echo ============================================================
echo    Verification Installation WAMP
echo    RECEPTION SALFA
echo ============================================================
echo.

set "WAMP_FOUND=0"
set "APACHE_OK=0"
set "MYSQL_OK=0"
set "PHP_OK=0"

REM === LOCALISER WAMP ===

echo [1/5] Recherche de WAMP...

REM Chemins communs WAMP
set "WAMP_PATHS=C:\wamp64;C:\wamp;C:\wamp32;C:\laragon\www"

for %%P in (%WAMP_PATHS%) do (
    if exist "%%P\wampmanager.exe" (
        set "WAMP_PATH=%%P"
        set "WAMP_FOUND=1"
    )
    if exist "%%P\bin\apache" (
        if !WAMP_FOUND! EQU 0 (
            set "WAMP_PATH=%%P"
            set "WAMP_FOUND=1"
        )
    )
)

if %WAMP_FOUND% EQU 1 (
    echo   [OK] WAMP trouve: %WAMP_PATH%
) else (
    echo   [ERREUR] WAMP non trouve dans les chemins habituels
    echo   Chemin suppose: %WAMP_PATH%
    echo   Assurez-vous que WAMP est installe et accessible.
)

echo.

REM === VÉRIFIER APACHE ===

echo [2/5] Verification Apache...

set "APACHE_DIR=%WAMP_PATH%\bin\apache"
if exist "%APACHE_DIR%" (
    for /f "delims=" %%D in ('dir /b /ad "%APACHE_DIR%" 2^>nul ^| findstr /i "apache"') do (
        set "APACHE_VERSION=%%D"
        set "APACHE_PATH=%APACHE_DIR%\!APACHE_VERSION!"
    )
    
    if exist "!APACHE_PATH!\bin\httpd.exe" (
        echo   [OK] Apache installe: !APACHE_VERSION!
        set "APACHE_OK=1"
        
        REM Vérifier le module rewrite
        if exist "!APACHE_PATH!\conf\httpd.conf" (
            findstr /I "mod_rewrite" "!APACHE_PATH!\conf\httpd.conf" >nul
            if !ERRORLEVEL! EQU 0 (
                echo   [OK] Module rewrite actif
            ) else (
                echo   [WARN] Module rewrite non configure
            )
        )
    ) else (
        echo   [ERREUR] httpd.exe non trouve
    )
) else (
    echo   [ERREUR] Apache non installe
)

echo.

REM === VÉRIFIER MYSQL ===

echo [3/5] Verification MySQL...

set "MYSQL_DIR=%WAMP_PATH%\bin\mysql"
if exist "%MYSQL_DIR%" (
    for /f "delims=" %%D in ('dir /b /ad "%MYSQL_DIR%" 2^>nul') do (
        set "MYSQL_VERSION=%%D"
        set "MYSQL_PATH=%MYSQL_DIR%\!MYSQL_VERSION!"
    )
    
    if exist "!MYSQL_PATH!\bin\mysql.exe" (
        echo   [OK] MySQL installe: !MYSQL_VERSION!
        set "MYSQL_OK=1"
        
        REM Test de connexion
        echo   Test de connexion MySQL...
        echo exit | "!MYSQL_PATH!\bin\mysql.exe" -u root -e "SELECT 1;" >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            echo   [OK] Connexion MySQL reussie
        ) else (
            echo   [WARN] Connexion MySQL echouee (verifiez le mot de passe)
        )
    ) else (
        echo   [ERREUR] mysql.exe non trouve
    )
) else (
    echo   [ERREUR] MySQL non installe
)

echo.

REM === VÉRIFIER PHP ===

echo [4/5] Verification PHP...

set "PHP_DIR=%WAMP_PATH%\bin\php"
if exist "%PHP_DIR%" (
    for /f "delims=" %%D in ('dir /b /ad "%PHP_DIR%" 2^>nul') do (
        set "PHP_VERSION=%%D"
        set "PHP_PATH=%PHP_DIR%\!PHP_VERSION!"
    )
    
    if exist "!PHP_PATH!\php.exe" (
        echo   [OK] PHP installe: !PHP_VERSION!
        set "PHP_OK=1"
        
        REM Vérifier extensions utiles
        if exist "!PHP_PATH!\php.ini" (
            findstr /I "extension=pdo_mysql" "!PHP_PATH!\php.ini" >nul
            if !ERRORLEVEL! EQU 0 (
                echo   [OK] Extension PDO MySQL active
            ) else (
                echo   [WARN] Extension PDO MySQL non activee
            )
            
            findstr /I "extension=gd2" "!PHP_PATH!\php.ini" >nul
            if !ERRORLEVEL! EQU 0 (
                echo   [OK] Extension GD activee
            ) else (
                echo   [WARN] Extension GD non activee
            )
        )
    ) else (
        echo   [ERREUR] php.exe non trouve
    )
) else (
    echo   [ERREUR] PHP non installe
)

echo.

REM === VÉRIFIER CONFIGURATION ===

echo [5/5] Verification configuration...

if exist "%WAMP_PATH%\logs" (
    echo   [OK] Dossier logs accessible
) else (
    echo   [WARN] Dossier logs non trouve
)

if exist "%WAMP_PATH%\www" (
    echo   [OK] Dossier www accessible
) else (
    echo   [ERREUR] Dossier www non trouve
)

REM Vérifier Apache conf extra
if exist "%WAMP_PATH%\conf\extra" (
    echo   [OK] Dossier conf/extra accessible
) else (
    echo   [WARN] Dossier conf/extra non trouve
)

echo.

REM === RÉSUMÉ ===

echo ============================================================
echo    RESUME DE LA VERIFICATION
echo ============================================================
echo.

if %WAMP_FOUND% EQU 1 (
    echo   WAMP Server:     [OK] Trouve
) else (
    echo   WAMP Server:     [ERREUR] Non trouve
)

if %APACHE_OK% EQU 1 (
    echo   Apache:          [OK] Operationnel
) else (
    echo   Apache:          [ERREUR] Non operationnel
)

if %MYSQL_OK% EQU 1 (
    echo   MySQL:           [OK] Operationnel
) else (
    echo   MySQL:           [ERREUR] Non operationnel
)

if %PHP_OK% EQU 1 (
    echo   PHP:             [OK] Operationnel
) else (
    echo   PHP:             [ERREUR] Non operationnel
)

echo.

if %WAMP_FOUND% EQU 1 (
    if %APACHE_OK% EQU 1 (
        if %MYSQL_OK% EQU 1 (
            if %PHP_OK% EQU 1 (
                echo   ============================================================
                echo   [SUCCESS] WAMP pret pour le deploiement!
                echo   ============================================================
                echo.
                echo   Prochaine etape: Executez deploy.bat
                echo.
            ) else (
                echo   [ERREUR] PHP non operationnel. Redemarrez WAMP.
            )
        ) else (
            echo   [ERREUR] MySQL non operationnel. Verifiez la configuration.
        )
    ) else (
        echo   [ERREUR] Apache non operationnel. Verifiez la configuration.
    )
) else (
    echo   ============================================================
    echo   [ERREUR] WAMP non correctement installe.
    echo   ============================================================
    echo.
    echo   Assurez-vous que:
    echo   1. WAMP est installe (C:\wamp64 ou C:\wamp)
    echo   2. Les services Apache et MySQL sont demarres
    echo   3. WAMP est accessible depuis le menu Demarrer
)

echo.

REM === OUVRIR phpMyAdmin ===

set "OPEN_PMA="
set /p OPEN_PMA="Voulez-vous ouvrir phpMyAdmin? (O/N): "
if /i "%OPEN_PMA%"=="O" (
    start http://localhost/phpmyadmin
)

echo.
pause
endlocal
