# QUICKSTART — RECEPTION SALFA sur WAMP (10 étapes)

> Durée : ~15 minutes. PC serveur : Windows + WAMP installé.

1. **Démarrer WAMP** → attendre l'icône **verte** dans la barre des tâches.
2. **Ouvrir phpMyAdmin** : `http://localhost/phpmyadmin`
3. **Importer le schéma** : onglet *Importer* → choisir
   `wamp_deploy\database\schema.sql` → *Exécuter*.
4. **Importer les comptes** : même opération avec `wamp_deploy\database\seed.sql`.
5. **Mot de passe MySQL ?** Si votre MySQL a un mot de passe (sinon : rien à faire),
   créer `wamp_deploy\api\config.local.php` contenant :
   ```php
   <?php
   define('SALFA_DB_PASS', 'votre-mot-de-passe-mysql');
   ```
6. **Compiler l'application** (invite de commandes à la racine du projet) :
   ```bat
   npm install
   npm run build:wamp
   copy dist\index.html wamp_deploy\index.html
   ```
7. **Déployer** : double-cliquer `wamp_deploy\outils\deployer.bat`.
8. **Vérifier** : ouvrir `http://localhost/reception-salfa/api/diagnostic.php`
   → tout doit être ✅ vert. Sinon, suivre les « conduites à tenir ».
9. **Ouvrir l'application** : `http://localhost/reception-salfa/`
   → se connecter avec `USR-ADMIN` / `admin123`.
10. **SÉCURITÉ (obligatoire)** : Administration → Utilisateurs →
    **changer TOUS les mots de passe** (voir `SECURITE.md`).

Ensuite : planifier `outils\sauvegarder.bat` chaque jour
(Planificateur de tâches Windows, 23h00) + copie sur disque externe.
