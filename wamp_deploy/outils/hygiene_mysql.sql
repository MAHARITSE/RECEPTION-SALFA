-- ============================================================================
-- RECEPTION SALFA — Assainissement MySQL (à faire UNE fois, à l'installation)
--
-- Le poste WAMP arrive avec `root` SANS MOT DE PASSE, écoutant sur toutes les
-- interfaces : n'importe quel ordinateur du réseau du centre peut lire, modifier
-- ou effacer tous les dossiers médicaux sans passer par l'application.
-- Ce script crée un compte applicatif aux privilèges strictement limités à la
-- base reception_salfa, et rappelle comment verrouiller root.
--
-- EXÉCUTION (invite de commandes, en administrateur) :
--   "C:\wamp64\bin\mysql\mysql8.0.xx\bin\mysql.exe" -u root < hygiene_mysql.sql
-- Si un mot de passe root existe déjà : ajouter -p.
-- ============================================================================

-- 1) Compte applicatif. CHANGEZ le mot de passe ci-dessous (16 caractères,
--    mélange de lettres/chiffres) AVANT d'exécuter ce script : il sera recopié
--    tel quel dans api/config.local.php.
CREATE USER IF NOT EXISTS 'salfa'@'localhost' IDENTIFIED BY 'REMPLACER-PAR-MOT-DE-PASSE-FORT';
CREATE USER IF NOT EXISTS 'salfa'@'127.0.0.1' IDENTIFIED BY 'REMPLACER-PAR-MOT-DE-PASSE-FORT';

-- 2) Privilèges : uniquement la base de l'application, aucune administration.
--    (Pas de DROP : une erreur d'exploitation ne peut pas détruire le schéma ;
--     les migrations restent faites par un humain sous `root`.)
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW
  ON `reception_salfa`.* TO 'salfa'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW
  ON `reception_salfa`.* TO 'salfa'@'127.0.0.1';
FLUSH PRIVILEGES;

-- 3) Vérifications (exécutables à tout moment) :
--    - qui peut se connecter et depuis où ?
SELECT user, host, plugin FROM mysql.user ORDER BY user, host;
--    - ce que peut faire le compte applicatif :
SHOW GRANTS FOR 'salfa'@'localhost';
--    - le port est-il fermé au réseau ? (à faire depuis un AUTRE poste)
--        telnet 192.168.x.x 3306      → doit échouer
--    - la variable de liaison :
SHOW VARIABLES LIKE 'bind_address';

-- 4) Contrôles de volume (à lire chaque trimestre, ou via api/diagnostic.php) :
SELECT table_name,
       table_rows,
       ROUND(data_length  /1048576, 1) AS data_mo,
       ROUND(index_length /1048576, 1) AS index_mo,
       ROUND((data_length + index_length)/1048576, 1) AS total_mo
  FROM information_schema.tables
 WHERE table_schema = 'reception_salfa'
 ORDER BY (data_length + index_length) DESC
 LIMIT 15;

--    Ligne d'alerte : total > 100 Mo → la relecture complète de l'API devient
--    le facteur limitant (voir docs/AUDIT_WAMP_100_PAR_JOUR.md §2 et §7).

-- 5) APRÈS ce script : créer/éditer wamp_deploy/api/config.local.php avec
--
--      <?php
--      define('SALFA_DB_USER', 'salfa');
--      define('SALFA_DB_PASS', 'REMPLACER-PAR-MOT-DE-PASSE-FORT');
--      define('SALFA_DEBUG',   false);
--
--    puis vérifier que l'application fonctionne (api/diagnostic.php en vert),
--    AVANT de verrouiller root à l'étape 6.
--
-- 6) Verrouiller root (une fois le compte applicatif validé, et le mot de passe
--    noté dans le coffret de l'établissement) :
--        ALTER USER 'root'@'localhost' IDENTIFIED BY 'MOT-DE-PASSE-ADMIN-16C';
--    puis, dans my.ini [mysqld] :  bind-address = 127.0.0.1   et redémarrer MySQL.
--    Attention : phpMyAdmin de WAMP utilisera alors le compte root avec mot de
--    passe (le laisser tel quel n'est pas un problème s'il n'est accessible que
--    depuis le PC serveur).
