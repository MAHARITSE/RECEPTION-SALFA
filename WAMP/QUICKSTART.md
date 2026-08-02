# Démarrage rapide WAMP — RECEPTION SALFA

> ⚠️ **Important** : dans la version WAMP, **toutes les données sont stockées
> strictement dans MySQL**. L'application charge son état complet depuis MySQL au
> démarrage et y sauvegarde automatiquement **chaque** modification. Rien n'est
> conservé dans le navigateur ni dans un fichier JSON.

## Option A — copie manuelle

1. Copier tout le dossier `WAMP` vers :
   `C:\wamp64\www\reception-salfa`
2. Démarrer WAMP et vérifier que l'icône est verte (Apache **et** MySQL).
3. Aller dans phpMyAdmin : `http://localhost/phpmyadmin`.
4. Importer (en 2 étapes) :
   - **[REQUIS]** `C:\wamp64\www\reception-salfa\database\import_wamp_state.sql`
     → crée la base `reception_salfa`, la table `salfa_app_state` et l'état initial.
   - **[OPTIONNEL]** `C:\wamp64\www\reception-salfa\database\import_full.sql`
     → schéma relationnel classique de démonstration (non utilisé par l'app).
5. Ouvrir : `http://localhost/reception-salfa/`

## Option B — script automatique

Depuis le dépôt projet :

```cmd
WAMP\deployment\install_wamp.bat
```

Le script copie la version WAMP vers `C:\wamp64\www\reception-salfa` et propose
l'import SQL si le client MySQL de WAMP est trouvé.

## Tests utiles

- Application : `http://localhost/reception-salfa/`
- API santé : `http://localhost/reception-salfa/api/health.php`
- API état : `http://localhost/reception-salfa/api/state.php`

## Vérifier que les données sont bien dans MySQL

1. Faire une action dans l'application (ex. inscrire un patient).
2. Ouvrir phpMyAdmin → base `reception_salfa` → table `salfa_app_state`.
3. La ligne `default` contient tout l'état applicatif dans `state_json` et la
   colonne `updated_at` est mise à jour.
4. Le badge vert en bas à gauche de l'application affiche
   « MySQL : toutes les données synchronisées ».

## Si la page ne s'affiche pas

- Vérifier que le dossier cible est bien `C:\wamp64\www\reception-salfa`.
- Vérifier Apache dans WAMP.
- Activer `rewrite_module` si vous utilisez les routes internes.
- Vérifier le fichier `.htaccess` dans le dossier cible.

## Si MySQL ne répond pas

- Vérifier que MySQL/MariaDB est démarré dans WAMP.
- Vérifier `config/db_config.php` : utilisateur `root`, mot de passe vide par défaut.
- Tester `api/health.php` dans le navigateur.
- L'application fonctionne quand même en mémoire mais le badge rouge
  « MySQL injoignable » s'affiche : aucune donnée n'est alors sauvegardée.
