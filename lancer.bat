@echo off
REM Lancement local du projet RECEPTION SALFA pour essai

REM Vérifier que les dépendances sont installées
if not exist "node_modules" (
    echo node_modules manquant. Lancement du setup...
    call setup.bat
)

echo Lancement du serveur de développement (local pour essai)...
npm run dev
