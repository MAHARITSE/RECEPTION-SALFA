@echo off
REM ============================================================
REM RECEPTION SALFA - Import Base de Données
REM ============================================================
REM Exécute ce script pour importer la structure et les
REM données de démonstration dans MySQL
REM ============================================================

setlocal

echo.
echo ============================================================
echo    Import Base de Donnees - RECEPTION SALFA
echo ============================================================
echo.

REM === CONFIGURATION ===
set "MYSQL_PATH=C:\wamp64\bin\mysql\mysql8.0.30\bin"  <- Modifier selon votre version
set "DB_NAME=reception_salfa"
set "DB_USER=root"
set "DB_PASS="

REM === SÉLECTION DU FICHIER À IMPORTER ===

echo Choisissez l'option:
echo   1. Structure uniquement (tables vides)
echo   2. Structure + Donnees de demonstration
echo   3. Quitter
echo.

set /p CHOICE="Votre choix (1-3): "

if "%CHOICE%"=="1" (
    set "SQL_FILE=%~dp0import_structure.sql"
    set "ACTION=import de la structure"
) else if "%CHOICE%"=="2" (
    set "SQL_FILE=%~dp0import_full.sql"
    set "ACTION=import complet"
) else (
    echo Operation annulee.
    pause
    exit /b 0
)

REM Vérifier que le fichier existe
if not exist "%SQL_FILE%" (
    echo [ERREUR] Fichier SQL non trouve: %SQL_FILE%
    pause
    exit /b 1
)

REM === IMPORT MYSQL ===

echo.
echo Import en cours... (~%ACTION%)

REM Méthode 1: Avec mysql.exe (si dans le PATH ou configuré)
set "MYSQL_EXE=%MYSQL_PATH%\mysql.exe"
if exist "%MYSQL_EXE%" (
    "%MYSQL_EXE%" -u %DB_USER% -p%DB_PASS% < "%SQL_FILE%"
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Import reussi!
    ) else (
        echo [ERREUR] Echec de l'import.
    )
    goto :end
)

REM Méthode 2: Via phpMyAdmin (instructions)
echo.
echo [INFO] mysql.exe non trouve automatiquement.
echo.
echo Pour importer manuellement via phpMyAdmin:
echo   1. Ouvrez http://localhost/phpmyadmin
echo   2. Creez une base de donnees: reception_salfa
echo   3. Cliquez sur "Importer"
echo   4. Selectionnez le fichier: %SQL_FILE%
echo   5. Cliquez sur "Executer"
echo.

:end
echo.
pause
endlocal
