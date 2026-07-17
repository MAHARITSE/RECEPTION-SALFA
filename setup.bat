@echo off
:: Desactiver l'affichage des commandes pour plus de clarte
title RECEPTION SALFA - Installation et Configuration
cls

echo ======================================================================
echo          INSTALLATION DE L'APPLICATION RECEPTION SALFA
echo ======================================================================
echo.

:: Verification de la presence de Node.js
echo Verification de la presence de Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe sur votre machine.
    echo Node.js est absolument requis pour installer et faire fonctionner cette application.
    echo.
    echo Veuillez le telecharger et l'installer depuis : https://nodejs.org/
    echo Une fois installe, veuillez relancer ce script.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js est installe :
call node -v
echo.

:: Installation des dependances npm
echo Installation des dependances de l'application (npm install)...
echo Cela peut prendre quelques instants en fonction de votre connexion...
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] L'installation des dependances a echoue.
    echo Veuillez verifier votre connexion internet et reessayer.
    echo.
    pause
    exit /b 1
)
echo.
echo [OK] Les dependances ont ete installees avec succes !
echo.

:: Compilation initiale de l'application
echo Compilation initiale de l'application (npm run build)...
echo Generation de la version de production autonome (Fichier unique)...
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ATTENTION] La compilation a echoue.
    echo Vous pouvez cependant toujours essayer de lancer l'application en mode developpement.
) else (
    echo.
    echo [OK] Compilation terminee avec succes !
    echo Le fichier unique autonome a ete cree avec succes dans "dist/index.html".
)
echo.
echo ======================================================================
echo  L'installation est terminee avec succes !
echo  Vous pouvez maintenant utiliser "lancer.bat" pour demarrer l'application.
echo ======================================================================
echo.
pause
