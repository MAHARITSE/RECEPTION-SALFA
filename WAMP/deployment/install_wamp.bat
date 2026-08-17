@echo off
setlocal EnableExtensions
title RECEPTION SALFA - Installation WAMP (MySQL normalise)

REM ============================================================================
REM  RECEPTION SALFA - Installation dans WampServer
REM  Copie la version WAMP vers C:\wamp64\www\reception-salfa et propose
REM  l'import du schema MySQL normalise (database\reception_salfa.sql) et la
REM  migration optionnelle des anciennes tables prefixees salfa_.
REM ============================================================================

set "SRC=%~dp0.."
set "DST=C:\wamp64\www\reception-salfa"
set "MYSQL_CLIENT="

echo.
echo ============================================================
echo   RECEPTION SALFA - Installation WAMP / MySQL normalise
echo ============================================================
echo.

REM --- 1. Verifier la source ------------------------------------------------
if not exist "%SRC%\index.html" (
    echo ERREUR : dossier source introuvable (%SRC%).
    pause
    exit /b 1
)

REM --- 2. Copier le dossier vers www ----------------------------------------
echo [1/4] Copie vers %DST% ...
if not exist "%DST%" mkdir "%DST%"
xcopy "%SRC%\*" "%DST%\" /E /I /Y /Q >nul
if errorlevel 1 (
    echo ERREUR : copie impossible. Lancez ce script en Administrateur.
    pause
    exit /b 1
)
echo        Copie terminee.

REM --- 3. Verifier que WAMP (MySQL) est disponible --------------------------
echo [2/4] Recherche du client MySQL de WAMP...
for %%p in (
    "%ProgramFiles%\wamp64\bin\mariadb\*\bin\mysql.exe"
    "%ProgramFiles%\wamp64\bin\mysql\*\bin\mysql.exe"
    "%ProgramFiles(x86)%\wamp64\bin\mariadb\*\bin\mysql.exe"
    "%ProgramFiles(x86)%\wamp64\bin\mysql\*\bin\mysql.exe"
    "C:\wamp64\bin\mariadb\*\bin\mysql.exe"
    "C:\wamp64\bin\mysql\*\bin\mysql.exe"
) do if exist "%%p" set "MYSQL_CLIENT=%%p"

if defined MYSQL_CLIENT (
    echo        Client MySQL trouve : %MYSQL_CLIENT%
) else (
    echo        Client MySQL non trouve - l'import se fera via phpMyAdmin.
)

REM --- 4. Import du schema normalise ------------------------------------------
echo [3/4] Import du schema MySQL normalise...
set "SQL_FILE=%DST%\database\reception_salfa.sql"
set "MIGRATION_FILE=%DST%\database\migration_tables_francaises.sql"
set "MIGRATION_ARTICLES=%DST%\database\migration_articles_unifies.sql"

if defined MYSQL_CLIENT (
    "%MYSQL_CLIENT%" -h 127.0.0.1 -P 3306 -u root -e "source %SQL_FILE%" 2>nul
    if errorlevel 1 (
        echo        Import automatique impossible.
        echo        Ouvrez http://localhost/phpmyadmin, puis importez :
        echo          database\reception_salfa.sql
        echo          database\migration_articles_unifies.sql
    ) else (
        echo        Import du schema termine (base reception_salfa).
        "%MYSQL_CLIENT%" -h 127.0.0.1 -P 3306 -u root -e "source %MIGRATION_FILE%" 2>nul
        if errorlevel 1 (
            echo        Migration des anciens noms non executee : importez
            echo          database\migration_tables_francaises.sql si necessaire.
        ) else (
            echo        Verification des anciens noms de tables terminee.
        )
        "%MYSQL_CLIENT%" -h 127.0.0.1 -P 3306 -u root -e "source %MIGRATION_ARTICLES%" 2>nul
        if errorlevel 1 (
            echo        Migration articles unifies non executee : importez
            echo          database\migration_articles_unifies.sql si necessaire.
        ) else (
            echo        Base articles unifies (LABO + ECHO) verifiee.
        )
    )
) else (
    echo        Ouvrez http://localhost/phpmyadmin et importez :
    echo          database\reception_salfa.sql
    echo          database\migration_articles_unifies.sql
)

REM --- 5. Recapitulatif -------------------------------------------------------
echo [4/4] Fin de l'installation.
echo.
echo ============================================================
echo   Pour verifier l'installation :
echo     - API / Diagnostic : http://localhost/reception-salfa/api/diagnostic.php
echo     - Application      : http://localhost/reception-salfa/
echo   Si l'icone WAMP est verte et que le diagnostic repond
echo   "Connexion MySQL reussie", tout est pret.
echo ============================================================
echo.
pause
exit /b 0
