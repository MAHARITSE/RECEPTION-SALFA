# Démarrage rapide WAMP — RECEPTION SALFA

> ⚠️ Dans la version WAMP, **toutes les données sont stockées dans MySQL** dans
> des **tables normalisées** (`patients`, `ventes`, …). L'application
> charge son état complet au démarrage et y sauvegarde automatiquement **chaque**
> modification. Rien n'est conservé dans le navigateur ni dans un fichier JSON.

## Option A — copie manuelle

1. Copier tout le dossier `WAMP` vers : `C:\wamp64\www\reception-salfa`
2. Démarrer WAMP et vérifier que l'icône est **verte** (Apache **et** MySQL).
3. Aller dans phpMyAdmin : `http://localhost/phpmyadmin`
4. Importer : `database\reception_salfa.sql`
   → crée la base `reception_salfa` + **toutes les tables normalisées**.
5. Ouvrir : `http://localhost/reception-salfa/`

> Si vous mettez à jour une ancienne installation qui contient des tables
> `salfa_*`, sauvegardez la base puis importez
> `database\migration_tables_francaises.sql` **avant** d'ouvrir l'application.
> Les données sont conservées et les tables sont renommées en français.

> Au premier lancement, si la base est vide, l'application y écrit son état
> initial (comptes, paramètres d'impression, catalogue…).

## Option B — script automatique

```cmd
WAMP\deployment\install_wamp.bat
```

## Vérifier l'installation

- **Diagnostic** : `http://localhost/reception-salfa/api/diagnostic.php`
- Application : `http://localhost/reception-salfa/`
- Santé API : `http://localhost/reception-salfa/api/index.php?action=health`

## Vérifier que les données sont bien dans MySQL

1. Faire une action dans l'application (ex. inscrire un patient).
2. phpMyAdmin → base `reception_salfa` → table `patients`.
3. La ligne contient l'objet complet dans `data_json` + les colonnes utiles.
4. Le badge vert en bas à gauche affiche « MySQL : toutes les données synchronisées ».

## Si MySQL ne répond pas

- Vérifier que MySQL/MariaDB est **vert** dans WAMP.
- Vérifier `api\config.php` : hôte `127.0.0.1`, port `3306`, base `reception_salfa`,
  utilisateur `root`, mot de passe vide par défaut.
- Importer `database\reception_salfa.sql`.
- Tester `api\diagnostic.php` dans le navigateur.
- L'application fonctionne quand même en mémoire mais le badge rouge
  « MySQL injoignable » s'affiche : aucune donnée n'est alors sauvegardée.
