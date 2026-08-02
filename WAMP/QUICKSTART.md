# Démarrage rapide WAMP — RECEPTION SALFA

## Option A — copie manuelle

1. Copier tout le dossier `WAMP` vers :
   `C:\wamp64\www\reception-salfa`
2. Démarrer WAMP et vérifier que l'icône est verte.
3. Aller dans phpMyAdmin : `http://localhost/phpmyadmin`.
4. Importer :
   - `C:\wamp64\www\reception-salfa\database\import_full.sql`
   - `C:\wamp64\www\reception-salfa\database\import_wamp_state.sql`
5. Ouvrir : `http://localhost/reception-salfa/`

## Option B — script automatique

Depuis le dépôt projet :

```cmd
WAMP\deployment\install_wamp.bat
```

Le script copie la version WAMP vers `C:\wamp64\www\reception-salfa` et propose l'import SQL si le client MySQL de WAMP est trouvé.

## Tests utiles

- Application : `http://localhost/reception-salfa/`
- API santé : `http://localhost/reception-salfa/api/health.php`
- API état : `http://localhost/reception-salfa/api/state.php`

## Si la page ne s'affiche pas

- Vérifier que le dossier cible est bien `C:\wamp64\www\reception-salfa`.
- Vérifier Apache dans WAMP.
- Activer `rewrite_module` si vous utilisez les routes internes.
- Vérifier le fichier `.htaccess` dans le dossier cible.

## Si MySQL ne répond pas

- Vérifier que MySQL/MariaDB est démarré dans WAMP.
- Vérifier `config/db_config.php` : utilisateur `root`, mot de passe vide par défaut.
- Tester `api/health.php` dans le navigateur.
