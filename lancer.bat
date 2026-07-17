@echo off
:: Desactiver l'affichage des commandes pour plus de clarte
title RECEPTION SALFA - Lancement de l'application
cls

:menu
echo ======================================================================
echo                     RECEPTION SALFA - LANCEMENT
echo ======================================================================
echo.
echo Veuillez choisir une option pour demarrer l'application :
echo.
echo  [1] Lancer en Mode Developpement
echo      - Demarre un serveur local avec rechargement automatique.
echo      - Recommande pour modifier le code ou faire des tests en direct.
echo.
echo  [2] Ouvrir l'application de Production (Fichier autonome)
echo      - Ouvre directement le fichier compact compile unique dans le navigateur.
echo      - Recommande pour l'utilisation courante (aucun serveur requis).
echo.
echo  [3] Lancer en Mode Apercu (Serveur de production local)
echo      - Demarre un serveur web local de production avec le build final.
echo.
echo  [4] Lancer l'installation des dependances ou mise a jour (setup.bat)
echo      - Utile lors du premier lancement ou apres une mise a jour du code.
echo.
echo  [5] Quitter
echo.
echo ======================================================================
echo.
set /p choix="Entrez votre choix (1-5) : "

if "%choix%"=="1" goto dev
if "%choix%"=="2" goto open_single
if "%choix%"=="3" goto preview
if "%choix%"=="4" goto setup
if "%choix%"=="5" goto exit

echo.
echo [ERREUR] Choix invalide. Veuillez saisir un nombre entre 1 et 5.
echo.
pause
cls
goto menu

:dev
echo.
echo Verification des dependances (dossier node_modules)...
if not exist "node_modules\" (
    echo [ATTENTION] Les dependances ne semblent pas installees.
    echo Lancement automatique de l'installation (setup.bat)...
    echo.
    call setup.bat
)
echo.
echo Demarrage du serveur de developpement...
echo Votre navigateur par defaut va s'ouvrir automatiquement sur l'application.
echo Gardez cette fenetre de commande ouverte tant que vous utilisez l'application.
echo.
:: Lance le serveur de developpement Vite et ouvre l'application dans le navigateur par defaut
start "" cmd /c "npm run dev -- --open"
goto end

:open_single
echo.
echo Verification du fichier de production compile...
if not exist "dist\index.html" (
    echo [ATTENTION] Le fichier de production n'existe pas.
    echo Compilation en cours de l'application...
    echo.
    call npm run build
)
if exist "dist\index.html" (
    echo.
    echo Ouverture de l'application autonome dans votre navigateur par defaut...
    start "" "dist\index.html"
) else (
    echo.
    echo [ERREUR] Impossible de trouver ou de compiler "dist\index.html".
    echo Veuillez executer l'option [4] ou verifier la presence de Node.js.
    pause
)
goto menu

:preview
echo.
echo Verification du fichier de production compile...
if not exist "dist\index.html" (
    echo [ATTENTION] Le fichier de production n'existe pas.
    echo Compilation en cours de l'application...
    echo.
    call npm run build
)
echo.
echo Demarrage du serveur d'apercu (preview)...
echo Votre navigateur par defaut va s'ouvrir automatiquement.
echo Gardez cette fenetre de commande ouverte tant que vous utilisez l'application.
echo.
:: Lance le serveur d'apercu de Vite et ouvre l'application dans le navigateur par defaut
start "" cmd /c "npm run preview -- --open"
goto end

:setup
echo.
echo Lancement du script d'installation...
echo.
call setup.bat
cls
goto menu

:exit
echo.
echo Merci d'avoir utilise RECEPTION SALFA !
echo.
timeout /t 2 >nul
exit

:end
echo.
echo Commande executee avec succes !
echo.
pause
cls
goto menu
