# RECEPTION SALFA — Version WAMP complète (100 % MySQL)

Ce dossier `WAMP/` contient une version prête à copier dans WAMP : l'application
compilée en un seul fichier, dont **TOUTES les données sont stockées dans MySQL**,
de manière **stricte et exclusive** : aucune donnée applicative n'est conservée
dans le navigateur (`localStorage`) ni dans un fichier JSON local.

## 🗄️ Architecture de stockage — strictement MySQL

```
┌─────────────────────────────┐        ┌──────────────────────────────────────────┐
│  WAMP/index.html            │  GET   │  PHP  api/state.php                      │
│  (application React/Vite)   │ ─────▶ │  ──────────────────────────────────────  │
│                             │  PUT   │  Table MySQL : salfa_app_state           │
│  Au démarrage : charge tout │ ◀───── │  (base : reception_salfa)                │
│  À chaque action : sauvegarde│        │  État complet : patients, consultations, │
│  tout (patients, factures,  │        │  factures, ventes, pharmacies, labo,     │
│  stocks, messages, audit…)  │        │  stocks, messagerie, journal d'audit…    │
└─────────────────────────────┘        └──────────────────────────────────────────┘
```

- **Au démarrage** : l'application charge son **état complet** depuis MySQL
  (`GET api/state.php`) — il n'y a donc aucune perte de données au rechargement.
- **À chaque modification** : l'application **sauvegarde automatiquement**
  l'état complet dans MySQL (`PUT api/state.php`, sauvegarde différée 800 ms) —
  tout est enregistré : dossiers patients, consultations, ordonnances, caisse,
  ventes, pharmacie, stocks, laboratoire, messagerie, journal d'audit…
- **À la fermeture de l'onglet** : un dernier enregistrement (`sendBeacon`) est
  envoyé pour ne perdre aucune saisie.
- **Badge de synchronisation** (en bas à gauche de l'écran) : indique en direct
  l'état de la liaison MySQL : `Chargement…`, `Sauvegarde…`, `Synchronisé` ou
  `MySQL injoignable`.

## Contenu

```text
WAMP/
├── index.html                  # Application React/Vite compilée en un seul fichier
├── .htaccess                   # Réécriture Apache + limites PHP pour l'API d'état
├── api/                        # API PHP : état MySQL (state.php) + santé (health.php)
├── config/db_config.php        # Connexion MySQL/PDO WAMP
├── database/                   # Scripts SQL d'import MySQL
├── apache/reception-salfa.conf # Exemple VirtualHost/Alias Apache
├── deployment/                 # Scripts Windows d'installation/vérification
└── uploads/                    # Dossier fichiers téléversés
```

## Installation rapide

1. Vérifier que WAMP est démarré et **vert** (Apache + MySQL).
2. Copier le dossier `WAMP` dans `C:\wamp64\www\reception-salfa`.
3. Importer **obligatoirement** dans MySQL (phpMyAdmin → `http://localhost/phpmyadmin`) :
   - `database/import_wamp_state.sql` — crée la base `reception_salfa`, la table
     `salfa_app_state` et y insère l'état initial complet.
4. (Optionnel) `database/import_full.sql` — schéma relationnel classique de
   démonstration, **non utilisé** par l'application compilée.
5. Ouvrir : `http://localhost/reception-salfa/`.

Vous pouvez aussi tout automatiser avec :

```cmd
WAMP\deployment\install_wamp.bat
```

> ℹ️ Si la table `salfa_app_state` est absente ou vide, l'application démarre
> quand même (état initial intégré) et ré-écrit immédiatement l'état dans MySQL :
> le badge en bas à gauche confirme « MySQL : toutes les données synchronisées ».

## Vérifier que tout est bien dans MySQL

1. Ouvrir phpMyAdmin → base `reception_salfa` → table `salfa_app_state`.
2. La ligne `default` contient tout l'état applicatif dans `state_json`
   (colonne `LONGTEXT`).
3. La colonne `updated_at` change à **chaque** action effectuée dans l'application.
4. Un `mysqldump` de la base `reception_salfa` constitue une sauvegarde complète
   et fidèle de l'application.

## Comptes présents dans l'application compilée

Ces comptes viennent de l'état initial (importé dans MySQL au moment du build) :

| Rôle | Identifiant affiché | Mot de passe |
|---|---|---|
| Admin | Admin Système | `admin123` |
| Réception | Aina Rakoto | `rec123` |
| Médecin | Dr. Feno Rasoana / Dr. Mialy Andria | `doc123` |
| Caisse | Caisse 1 - Miora Kanto / Caisse 2 - Pierre Duval | `caisse123` |
| Pharmacie | Pharmacie 1 - Tiana Soa / Pharmacie 2 - Fatima Benali | `pharma123` |
| Laboratoire | Hery Lanto | `labo123` |
| Magasinier | Niry Tahina | `mag123` |
| Facturation sociétés | Lova Sitraka | `fact123` |

## API WAMP

- Santé : `http://localhost/reception-salfa/api/health.php`
- État (GET/PUT/POST) : `http://localhost/reception-salfa/api/state.php`

`state.php` lit/écrit l'état complet dans la table `salfa_app_state` — c'est
précisément ce que l'application utilise pour TOUTES ses données.

## Recompiler la version WAMP

La version WAMP est générée depuis la source React avec le mode MySQL activé :

```bash
npm run build:wamp      # génère dist/index.html avec VITE_WAMP_MODE=1
cp dist/index.html WAMP/index.html
```

Le build standard (`npm run build`) reste inchangé (données en mémoire,
comportement d'origine, aucun appel à MySQL).

## Important

- **Strictement MySQL** : toutes les données applicatives de la partie WAMP sont
  dans la table MySQL `salfa_app_state` — pas de JSON local, pas de localStorage.
- Le fichier `index.html` est autonome : CSS et JavaScript sont intégrés.
- Si vous changez le nom du dossier web, adaptez `APP_URL` dans
  `config/db_config.php` et l'Alias Apache si vous l'utilisez.
