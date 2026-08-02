@echo off
setlocal EnableExtensions
title RECEPTION SALFA - Verification WAMP

REM ============================================================================
REM  RECEPTION SALFA - Verification de l'environnement WAMP (Apache + MySQL)
REM ============================================================================

echo.
echo ============================================================
echo   RECEPTION SALFA - Verification WAMP
echo ============================================================
echo.

echo [1/4] Verification de l'icone WampServer (doit etre VERTE)
echo        Si elle est orange/rouge : demarrez Apache et MySQL depuis WampServer.
echo.

echo [2/4] Test de l'API (diagnostic MySQL)...
where curl.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    curl.exe -fs -o nul -m 8 "http://localhost/reception-salfa/api/diagnostic.php"
    if errorlevel 1 (
        echo        ATTENTION : le diagnostic ne repond pas.
        echo        Verifiez qu'Apache est demarre et que le dossier
        echo        C:\wamp64\www\reception-salfa existe.
    ) else (
        echo        Diagnostic accessible : OK
        echo        Ouvrez http://localhost/reception-salfa/api/diagnostic.php
        echo        pour voir le detail de la connexion MySQL.
    )
) else (
    echo        curl introuvable - ouvrez le diagnostic a la main :
    echo        http://localhost/reception-salfa/api/diagnostic.php
)

echo [3/4] Test de l'application...
where curl.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    curl.exe -fs -o nul -m 8 "http://localhost/reception-salfa/"
    if errorlevel 1 (
        echo        Application inaccessible.
    ) else (
        echo        Application accessible : http://localhost/reception-salfa/
    )
)

echo [4/4] Rappel de la configuration MySQL (api\config.php)
echo        hote  : 127.0.0.1   port : 3306   base : reception_salfa
echo        user  : root        mdp   : (vide par defaut)
echo.
echo   Conseils si MySQL ne repond pas :
echo     - verifier que MySQL/MariaDB est VERT dans WampServer ;
echo     - importer database\reception_salfa.sql dans phpMyAdmin ;
echo     - verifier api\config.php si votre mot de passe n'est pas vide.
echo.
pause
exit /b 0
