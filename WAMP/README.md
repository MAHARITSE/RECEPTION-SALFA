# RECEPTION SALFA — Version WAMP complète (MySQL normalisé)

Ce dossier `WAMP/` contient une version prête à copier dans WAMP. **Toutes les
données sont stockées dans MySQL**, de manière **strictement exclusive** (aucune
donnée applicative dans `localStorage` ni dans un fichier JSON local).

Cette version a été **reconstruite en s'inspirant de [LogBara / Bar POS](https://github.com/MAHARITSE/LogBara)**
pour régler le problème de connexion à MySQL de WAMP :

- connexion MySQL en **`127.0.0.1`** (et non `localhost`, qui peut être résolu en
  IPv6 `::1` et échouer sous Windows/WAMP) ;
- **une table MySQL par entité métier** (`patients`, `ventes`,
  `articles`, …) au lieu d'un seul blob JSON ;
- page **`api/diagnostic.php`** pour vérifier l'installation en un coup d'œil ;
- fichiers de configuration **protégés** par `.htaccess` ;
- connexion PDO préparée, encodage `utf8mb4` ;
- tables sans préfixe `salfa_` et nommées en français (`patients`, `ventes`,
  `parametres_impression`, `comptes_facturation_societes`, …).

## 🗄️ Architecture de stockage — tables normalisées MySQL

```
┌─────────────────────────────┐   JSON    ┌─────────────────────────────────────┐
│  WAMP/index.html            │ ────────▶ │  PHP  api/index.php                 │
│  (application React/Vite)   │  read_all │  ────────────────────────────────── │
│                             │ ◀──────── │  Tables MySQL normalisées :         │
│  Au démarrage : charge tout │   sync    │   patients, ventes, articles,       │
│  À chaque action : sauvegarde│ ───────▶ │   utilisateurs, consultations, ...  │
│  (différée 800 ms)          │           │                                     │
└─────────────────────────────┘           └─────────────────────────────────────┘
```

- **Au démarrage** : l'application charge son état complet depuis MySQL
  (`GET api/index.php?action=read_all`). Aucune perte de données au rechargement.
- **À chaque modification** : l'application sauvegarde automatiquement l'état
  complet dans les tables normalisées (`POST api/index.php?action=sync_all`,
  sauvegarde différée 800 ms).
- **À la fermeture de l'onglet** : un dernier enregistrement (`sendBeacon`) est
  envoyé pour ne perdre aucune saisie.
- **Badge de synchronisation** (en bas à gauche) : `Chargement…`, `Sauvegarde…`,
  `Synchronisé` ou `MySQL injoignable`.

## Contenu

```text
WAMP/
├── index.html                  # Application React/Vite compilée en un seul fichier
├── .htaccess                   # Protections Apache + blocage des fichiers PHP sensibles
├── api/
│   ├── index.php               # API d'état JSON (read_all / sync_all / read / sync / health)
│   ├── config.php              # Connexion MySQL (127.0.0.1, root, base reception_salfa)
│   ├── database.php            # Connexion PDO (préparée, utf8mb4)
│   ├── datasets.php            # Correspondance collections ↔ tables MySQL normalisées
│   └── diagnostic.php          # Page de vérification de l'installation MySQL
├── database/
│   ├── reception_salfa.sql                 # Schéma normalisé (nouvelles installations)
│   └── migration_tables_francaises.sql     # Migration des anciennes tables salfa_ (si besoin)
├── deployment/                 # Scripts Windows d'installation / vérification
└── uploads/                    # Dossier fichiers téléversés
```

## Installation rapide

1. Vérifier que WAMP est démarré et **vert** (Apache + MySQL).
2. Copier le dossier `WAMP` vers `C:\wamp64\www\reception-salfa`.
3. Importer **obligatoirement** le schéma dans MySQL :
   - `database/reception_salfa.sql` → crée la base `reception_salfa` et **toutes
     les tables normalisées** (phpMyAdmin → `http://localhost/phpmyadmin`).
4. Ouvrir : `http://localhost/reception-salfa/`.

> Au **premier** lancement, si la base ne contient encore aucun compte, l'application
> y écrit automatiquement son état initial (utilisateurs, paramètres d'impression,
> catalogue articles, laboratoire…).

Vous pouvez aussi tout automatiser avec :

```cmd
WAMP\deployment\install_wamp.bat
```

## Vérifier que tout est bien dans MySQL

1. Ouvrir `http://localhost/reception-salfa/api/diagnostic.php` → la page indique
   « Connexion MySQL réussie » et le nombre de tables présentes.
2. phpMyAdmin → base `reception_salfa` : vous verrez **une table par entité**
   (`patients`, `ventes`, `articles`, …).
3. Dans chaque table, la colonne `data_json` contient l'objet complet ; les autres
   colonnes (`id`, `nom`, `date`, `statut`, montants…) servent à l'interrogation.
4. Un `mysqldump` de la base `reception_salfa` constitue une sauvegarde complète.

## Mise à jour d'une base existante

Les installations créées avec une version antérieure possèdent des tables telles
que `salfa_patients` et `salfa_ventes`. Sauvegardez d'abord la base, puis importez
`database/migration_tables_francaises.sql` dans phpMyAdmin **avant d'ouvrir
l'application mise à jour**. Le script renomme les tables et conserve les données.

Pour une nouvelle installation, importez uniquement
`database/reception_salfa.sql` : les tables sont déjà sans préfixe et portent des
noms français. Le script `deployment/install_wamp.bat` lance aussi la migration,
sans effet lorsqu'il n'y a aucune ancienne table.

## Comptes présents après le premier lancement

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

- Santé (JSON) : `http://localhost/reception-salfa/api/index.php?action=health`
- Lecture complète (JSON) : `http://localhost/reception-salfa/api/index.php?action=read_all`
- Écriture complète (JSON, POST) : `.../api/index.php?action=sync_all`
- Diagnostic (HTML) : `http://localhost/reception-salfa/api/diagnostic.php`

`config.php` se connecte à `127.0.0.1:3306`, base `reception_salfa`, utilisateur
`root`, mot de passe vide par défaut (paramétrable).

## Recompiler la version WAMP

```bash
npm run build:wamp      # génère dist/index.html avec VITE_WAMP_MODE=1
cp dist/index.html WAMP/index.html
```

Le build standard (`npm run build`) reste inchangé (données en mémoire).

## Si MySQL ne répond pas

- Vérifier que MySQL/MariaDB est **vert** dans WAMP.
- Vérifier `api/config.php` : hôte `127.0.0.1`, port `3306`, base `reception_salfa`,
  utilisateur `root`, mot de passe vide par défaut.
- Importer `database/reception_salfa.sql` (schéma obligatoire).
- Tester `api/diagnostic.php` dans le navigateur.
- L'application fonctionne quand même en mémoire mais le badge rouge
  « MySQL injoignable » s'affiche : aucune donnée n'est alors sauvegardée.
