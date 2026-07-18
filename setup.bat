@echo off
REM Setup du projet RECEPTION SALFA - Installation des dépendances

REM Vérifier que Node.js est installé
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js n'est pas installé. Veuillez installer Node.js.
    exit /b 1
)

echo Installation des dépendances...
npm install

echo Setup terminé !
