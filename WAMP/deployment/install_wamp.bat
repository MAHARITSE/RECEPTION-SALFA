@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM RECEPTION SALFA - Installation de la version WAMP prête
REM ============================================================

color 0A
set "APP_NAME=reception-salfa"
set "DEFAULT_WAMP=C:\wamp64"
set "WAMP_PATH=%DEFAULT_WAMP%"

REM Dossier WAMP source = parent du dossier deployment
for %%I in ("%~dp0..") do set "SOURCE_DIR=%%~fI"

echo.
echo ============================================================
echo   RECEPTION SALFA - INSTALLATION WAMP COMPLETE
echo ============================================================
echo.
echo Source : %SOURCE_DIR%
echo.

if not exist "%WAMP_PATH%" (
  echo [INFO] WAMP non trouve dans %WAMP_PATH%.
  set /p WAMP_PATH="Chemin WAMP (ex: C:\wamp64): "
)

if not exist "%WAMP_PATH%" (
  echo [ERREUR] Le chemin WAMP indique n'existe pas : %WAMP_PATH%
  pause
  exit /b 1
)

set "TARGET_DIR=%WAMP_PATH%\www\%APP_NAME%"

echo [1/4] Creation du dossier cible...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
if errorlevel 1 (
  echo [ERREUR] Impossible de creer %TARGET_DIR%.
  pause
  exit /b 1
)
echo [OK] %TARGET_DIR%

echo.
echo [2/4] Copie des fichiers WAMP...
xcopy "%SOURCE_DIR%\*" "%TARGET_DIR%\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo [ERREUR] Echec de la copie.
  pause
  exit /b 1
)
echo [OK] Application copiee.

echo.
echo [3/4] Configuration Apache optionnelle...
set "APACHE_EXTRA=%WAMP_PATH%\conf\extra"
if exist "%APACHE_EXTRA%" (
  copy /Y "%SOURCE_DIR%\apache\reception-salfa.conf" "%APACHE_EXTRA%\reception-salfa.conf" >nul
  echo [OK] Exemple de configuration copie : %APACHE_EXTRA%\reception-salfa.conf
  echo Ajoutez dans httpd.conf si necessaire : Include conf/extra/reception-salfa.conf
) else (
  echo [INFO] Dossier conf\extra introuvable, etape ignoree.
)

echo.
echo [4/4] Import SQL optionnel...
set "MYSQL_EXE="
for /R "%WAMP_PATH%\bin\mysql" %%M in (mysql.exe) do if not defined MYSQL_EXE set "MYSQL_EXE=%%M"

if defined MYSQL_EXE (
  echo Client MySQL detecte : !MYSQL_EXE!
  set /p DO_IMPORT="Importer maintenant la base reception_salfa ? (O/N): "
  if /I "!DO_IMPORT!"=="O" (
    "!MYSQL_EXE!" -u root < "%TARGET_DIR%\database\import_full.sql"
    if errorlevel 1 echo [ATTENTION] import_full.sql a signale une erreur.
    "!MYSQL_EXE!" -u root < "%TARGET_DIR%\database\import_wamp_state.sql"
    if errorlevel 1 echo [ATTENTION] import_wamp_state.sql a signale une erreur.
  ) else (
    echo Import ignore. Vous pourrez importer les fichiers via phpMyAdmin.
  )
) else (
  echo [INFO] mysql.exe introuvable. Importez les fichiers SQL via phpMyAdmin :
  echo   %TARGET_DIR%\database\import_full.sql
  echo   %TARGET_DIR%\database\import_wamp_state.sql
)

echo.
echo ============================================================
echo   INSTALLATION TERMINEE
echo ============================================================
echo Application : http://localhost/%APP_NAME%/
echo API sante  : http://localhost/%APP_NAME%/api/health.php
echo Dossier    : %TARGET_DIR%
echo.
pause
endlocal
