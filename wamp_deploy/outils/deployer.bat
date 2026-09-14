@echo off
REM ==========================================================================
REM  RECEPTION SALFA - Deploiement vers WAMP
REM  Copie index.html + api/ + database/ vers C:\wamp64\www\reception-salfa
REM  Usage : deployer.bat [dossier-cible]
REM  Le fichier api\config.local.php du serveur n'est JAMAIS ecrase.
REM ==========================================================================
chcp 65001 >nul
setlocal

set SRC=%~dp0..
set CIBLE=%~1
if "%CIBLE%"=="" set CIBLE=C:\wamp64\www\reception-salfa

if not exist "%SRC%\index.html" (
  echo [ERREUR] %SRC%\index.html introuvable.
  echo          Compilez d'abord l'application depuis la racine du projet :
  echo            npm install
  echo            npm run build:wamp
  echo          puis copiez dist\index.html vers wamp_deploy\index.html
  echo          (ou relancez ce script apres compilation).
  exit /b 1
)

echo Source : %SRC%
echo Cible  : %CIBLE%
if not exist "%CIBLE%" mkdir "%CIBLE%"

copy /Y "%SRC%\index.html" "%CIBLE%\index.html" >nul
if errorlevel 1 (
  echo [ERREUR] Copie de index.html impossible.
  exit /b 1
)
robocopy "%SRC%\api" "%CIBLE%\api" /E /XF config.local.php >nul
if errorlevel 8 (
  echo [ERREUR] Copie de api\ impossible (code %errorlevel%^).
  exit /b 1
)
robocopy "%SRC%\database" "%CIBLE%\database" /E >nul
if errorlevel 8 (
  echo [ERREUR] Copie de database\ impossible (code %errorlevel%^).
  exit /b 1
)

echo.
echo [OK] Application deployee vers %CIBLE%
echo.
echo Prochaines etapes (une seule fois) :
echo   1. WAMP demarre (icone verte), ouvrir phpMyAdmin :
echo      http://localhost/phpmyadmin
echo   2. Importer database\schema.sql puis database\seed.sql
echo   3. Si MySQL a un mot de passe : creer api\config.local.php :
echo      ^<?php define('SALFA_DB_PASS', 'votre-mot-de-passe'^);
echo   4. Verifier : http://localhost/reception-salfa/api/diagnostic.php
echo   5. Ouvrir :   http://localhost/reception-salfa/
echo      (admin : USR-ADMIN / admin123 - A CHANGER aussitot)
endlocal
