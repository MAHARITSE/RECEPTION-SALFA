@echo off
REM ==========================================================================
REM  RECEPTION SALFA - Restauration MySQL
REM  Usage : restaurer.bat chemin\vers\sauvegarde.sql
REM  DANGER : ecrase TOUTE la base actuelle. Ne jamais lancer sans reflechir.
REM ==========================================================================
chcp 65001 >nul
setlocal

if "%~1"=="" (
  echo Usage : restaurer.bat chemin\vers\sauvegarde.sql
  echo Exemple : restaurer.bat ..\sauvegardes\reception_salfa_20260914_230000.sql
  exit /b 1
)
if not exist "%~1" (
  echo [ERREUR] Fichier introuvable : %~1
  exit /b 1
)

if "%SALFA_DB_HOST%"=="" set SALFA_DB_HOST=127.0.0.1
if "%SALFA_DB_PORT%"=="" set SALFA_DB_PORT=3306
if "%SALFA_DB_NAME%"=="" set SALFA_DB_NAME=reception_salfa
if "%SALFA_DB_USER%"=="" set SALFA_DB_USER=root
if "%SALFA_DB_PASS%"=="" set SALFA_DB_PASS=

set MYSQL=
for /d %%D in (C:\wamp64\bin\mysql\mysql*) do (
  if exist "%%D\bin\mysql.exe" set MYSQL=%%D\bin\mysql.exe
)
if "%MYSQL%"=="" (
  echo [ERREUR] mysql.exe introuvable dans C:\wamp64\bin\mysql\
  exit /b 1
)

echo ==========================================================================
echo  DANGER : cette operation ECRASE toute la base %SALFA_DB_NAME%
echo  avec le contenu de : %~1
echo ==========================================================================
set /p CONFIRM=Tapez OUI en majuscules pour confirmer :
if not "%CONFIRM%"=="OUI" (
  echo Annule. Rien n'a ete modifie.
  exit /b 0
)

echo Restauration en cours...
if "%SALFA_DB_PASS%"=="" (
  "%MYSQL%" --host=%SALFA_DB_HOST% --port=%SALFA_DB_PORT% --user=%SALFA_DB_USER% "%SALFA_DB_NAME%" < "%~1"
) else (
  "%MYSQL%" --host=%SALFA_DB_HOST% --port=%SALFA_DB_PORT% --user=%SALFA_DB_USER% --password="%SALFA_DB_PASS%" "%SALFA_DB_NAME%" < "%~1"
)
if errorlevel 1 (
  echo [ERREUR] La restauration a echoue.
  exit /b 1
)
echo [OK] Base restauree. Verifiez : http://localhost/reception-salfa/api/diagnostic.php
endlocal
