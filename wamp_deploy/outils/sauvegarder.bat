@echo off
REM ==========================================================================
REM  RECEPTION SALFA - Sauvegarde MySQL (mysqldump)
REM  Usage : sauvegarder.bat
REM  Les sauvegardes sont conservees dans wamp_deploy\sauvegardes\
REM  (rotation : 7 derniers jours). A PLANIFIER chaque jour :
REM  Planificateur de taches Windows -^> executer ce script a 23h00.
REM
REM  Identifiants : memes valeurs que api\config.local.php.
REM  Modifiables via variables d'environnement : SALFA_DB_HOST, SALFA_DB_PORT,
REM  SALFA_DB_NAME, SALFA_DB_USER, SALFA_DB_PASS.
REM ==========================================================================
chcp 65001 >nul
setlocal

if "%SALFA_DB_HOST%"=="" set SALFA_DB_HOST=127.0.0.1
if "%SALFA_DB_PORT%"=="" set SALFA_DB_PORT=3306
if "%SALFA_DB_NAME%"=="" set SALFA_DB_NAME=reception_salfa
if "%SALFA_DB_USER%"=="" set SALFA_DB_USER=root
if "%SALFA_DB_PASS%"=="" set SALFA_DB_PASS=

set DEST=%~dp0..\sauvegardes
if not exist "%DEST%" mkdir "%DEST%"

REM Recherche de mysqldump dans WAMP.
set MYSQLDUMP=
for /d %%D in (C:\wamp64\bin\mysql\mysql*) do (
  if exist "%%D\bin\mysqldump.exe" set MYSQLDUMP=%%D\bin\mysqldump.exe
)
if "%MYSQLDUMP%"=="" (
  echo [ERREUR] mysqldump.exe introuvable dans C:\wamp64\bin\mysql\
  echo          WAMP est-il installe ? MySQL est-il demarre ?
  exit /b 1
)

set HORODATAGE=%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
set HORODATAGE=%HORODATAGE: =0%
set FICHIER=%DEST%\%SALFA_DB_NAME%_%HORODATAGE%.sql

echo Sauvegarde vers %FICHIER% ...
if "%SALFA_DB_PASS%"=="" (
  "%MYSQLDUMP%" --host=%SALFA_DB_HOST% --port=%SALFA_DB_PORT% --user=%SALFA_DB_USER% --single-transaction --routines --events "%SALFA_DB_NAME%" > "%FICHIER%"
) else (
  "%MYSQLDUMP%" --host=%SALFA_DB_HOST% --port=%SALFA_DB_PORT% --user=%SALFA_DB_USER% --password="%SALFA_DB_PASS%" --single-transaction --routines --events "%SALFA_DB_NAME%" > "%FICHIER%"
)
if errorlevel 1 (
  echo [ERREUR] La sauvegarde a echoue. MySQL tourne-t-il ? Identifiants corrects ?
  del "%FICHIER%" 2>nul
  exit /b 1
)

echo [OK] Sauvegarde terminee.
echo Rotation : suppression des sauvegardes de plus de 7 jours...
forfiles /P "%DEST%" /M *.sql /D -7 /C "cmd /c del @path" 2>nul
echo Termine. Pensez a COPIER les sauvegardes sur un disque externe.
endlocal
