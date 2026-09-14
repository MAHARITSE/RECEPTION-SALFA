# QUICKSTART — RECEPTION SALFA sur WAMP (12 étapes)

> Durée : ~25 minutes. PC serveur : Windows + WAMP installé.
> Les étapes 4bis, 5bis et 11 sont celles qui font tenir la charge
> (100+ passages/jour, 10 ans) : ne pas les sauter.

1. **Démarrer WAMP** → attendre l'icône **verte** dans la barre des tâches.
2. **Ouvrir phpMyAdmin** : `http://localhost/phpmyadmin`
3. **Importer le schéma** : onglet *Importer* → choisir
   `wamp_deploy\database\schema.sql` → *Exécuter*.
4. **Importer les comptes** : même opération avec `wamp_deploy\database\seed.sql`.
4bis. **Verrouiller MySQL (obligatoire)** : le WAMP par défaut expose `root` SANS
   mot de passe sur tout le réseau. Éditer le mot de passe du compte `salfa` dans
   `wamp_deploy\outils\hygiene_mysql.sql`, puis exécuter en administrateur :
   ```bat
   "C:\wamp64\bin\mysql\mysql8.0.xx\bin\mysql.exe" -u root < wamp_deploy\outils\hygiene_mysql.sql
   ```
5. **Compte applicatif** : créer `wamp_deploy\api\config.local.php` par copie de
   `api\config.local.php.exemple`, puis renseigner :
   ```php
   <?php
   define('SALFA_DB_USER', 'salfa');
   define('SALFA_DB_PASS', 'mot-de-passe-choisi-a-l-etape-4bis');
   ```
6. **Compiler l'application** (invite de commandes à la racine du projet) :
   ```bat
   npm install
   npm run build:wamp
   copy dist\index.html wamp_deploy\index.html
   ```
5bis. **Limites serveur** : coller les blocs `wamp_deploy\config\wamp-salfa-php.ini.txt`
   (php.ini) et `wamp_deploy\config\wamp-salfa-mysql.ini.txt` (my.ini, section
   `[mysqld]`), puis redémarrer tous les services WAMP. Sans cela, la sauvegarde
   automatique échouera dès les premières semaines (voir `PERFORMANCE.md` §2).
7. **Déployer** : double-cliquer `wamp_deploy\outils\deployer.bat`.
8. **Vérifier** : ouvrir `http://localhost/reception-salfa/api/diagnostic.php`
   → tout doit être ✅ vert. Sinon, suivre les « conduites à tenir ».
9. **Vérifier Apache** (le `.htaccess` doit être appliqué) :
   ```bat
   curl -i http://localhost/reception-salfa/database/seed.sql
   curl -i http://localhost/reception-salfa/api/config.local.php
   curl -i "http://localhost/reception-salfa/api/index.php?action=read_all"
   ```
   Attendus : `403`, `403`, `401`. Un `200` sur les deux premiers = `AllowOverride`
   inactif → voir `PERFORMANCE.md` §7.
10. **Ouvrir l'application** : `http://localhost/reception-salfa/`
    → se connecter avec `USR-ADMIN` / `admin123`.
11. **Mesurer votre serveur** (hors heures d'ouverture) :
    `php wamp_deploy\outils\test_charge.php` — indique la marge restante avant
    saturation de `memory_limit` et les réglages qui manquent encore.
12. **SÉCURITÉ (obligatoire)** : Administration → Utilisateurs →
    **changer TOUS les mots de passe** (8 caractères minimum, voir `SECURITE.md`).

Ensuite : planifier `outils\sauvegarder.bat` chaque jour
(Planificateur de tâches Windows, 23h00) + **copie chiffrée hors du PC serveur** +
test de restauration mensuel (`PERFORMANCE.md` §6).

---
**Base déjà installée (v1 ou v2) ?** Sauvegardez (`outils\sauvegarder.bat`), puis
importez dans phpMyAdmin (base `reception_salfa`), dans l'ordre et selon la version
affichée par `api/diagnostic.php` : `002_sequences.sql` (v1 → v2), puis
`003_performance.sql` (v2 → v3 : table `revision` + index de fraîcheur — à faire
HORS HEURES D'OUVERTURE). Redéployez ensuite. Sans v3, l'application reste
fonctionnelle mais chaque poste relit toute la base toutes les 5 secondes.
Détail dans `README.md`.
