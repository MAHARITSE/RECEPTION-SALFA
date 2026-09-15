@echo off
REM ==========================================================================
REM  RECEPTION SALFA - Deploiement vers WAMP
REM  Copie index.html + .htaccess + api/ + database/ + outils/ + config/
REM  vers C:\wamp64\www\reception-salfa
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
REM .htaccess racine : refus de database\, outils\, logs\, *.sql, config.local.php
REM + en-tetes de securite + LimitRequestBody. Sans ce fichier, les protections
REM Apache ne couvrent que les sous-dossiers.
if exist "%SRC%\.htaccess" copy /Y "%SRC%\.htaccess" "%CIBLE%\.htaccess" >nul
REM Outils d'exploitation installes sur le serveur (sauvegarde, restauration,
REM hygiene MySQL, banc d'essai de charge).
robocopy "%SRC%\outils" "%CIBLE%\outils" /E >nul
if errorlevel 8 (
  echo [ERREUR] Copie de outils\ impossible.
  exit /b 1
)
REM Blocs de reglages php.ini / my.ini a recopier dans WAMP (voir PERFORMANCE.md).
if exist "%SRC%\config" robocopy "%SRC%\config" "%CIBLE%\config" /E >nul
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
echo.
echo Prochaines etapes (a faire une fois, dans l'ordre) :
echo   1. Base existante v1/v2 : importer database\migrations\002_sequences.sql
echo      puis 003_performance.sql dans phpMyAdmin (apres outils\sauvegarder.bat).
echo      Nouvelle base : database\schema.sql puis database\seed.sql.
echo   2. Verrouiller MySQL : editer le mot de passe dans outils\hygiene_mysql.sql
echo      puis  mysql -u root < outils\hygiene_mysql.sql
echo      et creer api\config.local.php (modele : api\config.local.php.exemple).
echo   3. Coller config\wamp-salfa-php.ini.txt dans le php.ini de WAMP et
echo      config\wamp-salfa-mysql.ini.txt dans la section [mysqld] du my.ini,
echo      puis redemarrer les services.
echo   4. Verifier : http://localhost/reception-salfa/api/diagnostic.php (tout vert)
echo   5. Contrer les acces Apache :
echo      curl -i http://localhost/reception-salfa/database/seed.sql   (403 attendu)
echo      curl -i http://localhost/reception-salfa/api/config.local.php (403 attendu)
echo   6. Ouvrir http://localhost/reception-salfa/ (USR-ADMIN / admin123,
echo      A CHANGER aussitot : 8 caracteres minimum) ; puis hors heures :
echo      php outils\test_charge.php
echo.
echo NOTE : ce script ne compile PAS l'application. Si src\ a change, lancer
echo        d'abord npm run build:wamp et copier dist\index.html ici, sinon le
echo        poste tourne avec un index.html ancien (sans poll ^/ envoi differentiel).
endlocal
