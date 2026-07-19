@echo off
echo Lancement de RECEPTION SALFA sur le réseau...

REM On ferme les anciennes fenêtres pour que le mode silencieux s'active
taskkill /f /im chrome.exe >nul 2>&1
taskkill /f /im msedge.exe >nul 2>&1

echo Ouverture du navigateur...
REM Remplacez 192.168.1.50 par l'IP réelle de votre serveur WAMP
start chrome --kiosk-printing http://192.168.1.50/reception-salfa

if %ERRORLEVEL% NEQ 0 (
    start msedge --kiosk-printing http://192.168.1.50/reception-salfa
)