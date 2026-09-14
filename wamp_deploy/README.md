# RECEPTION SALFA — Déploiement WAMP (100 % MySQL)

Package complet pour faire tourner l'application sur un PC Windows avec **WAMP**
(Apache + PHP + MySQL), en réseau local multi-postes. Toutes les données
métier sont stockées dans MySQL — rien dans le navigateur.

> Installation express → voir **[QUICKSTART.md](QUICKSTART.md)** (10 étapes).
> Avertissements de sécurité → voir **[SECURITE.md](SECURITE.md)** (à lire !).

---

## Contenu du dossier

```text
wamp_deploy/
├── index.html            # application compilée (générée : npm run build:wamp)
├── BUILD.txt             # date + commit source de index.html
├── api/
│   ├── index.php         # API : info / read_all / sync_all (transactionnel)
│   ├── diagnostic.php    # page de santé : http://localhost/reception-salfa/api/diagnostic.php
│   ├── config.php        # identifiants MySQL par défaut (ne pas modifier)
│   ├── config.local.php  # VOS identifiants (à créer, jamais écrasé ni versionné)
│   ├── lib.php           # fonctions partagées (tables, PDO, journal)
│   └── logs/             # journaux d'erreurs (inaccessibles via HTTP)
├── database/
│   ├── schema.sql        # schéma v2 : 35 tables métier + parametres + compteurs + sequences + sessions
│   ├── migrations/       # mises à jour des BASES EXISTANTES (v1 → v2 : 002_sequences.sql)
│   └── seed.sql          # comptes par défaut + référentiels (familles, services…)
├── outils/
│   ├── deployer.bat      # copie vers C:\wamp64\www\reception-salfa
│   ├── sauvegarder.bat   # sauvegarde mysqldump + rotation 7 jours (à planifier !)
│   └── restaurer.bat     # restauration (avec confirmation OUI)
└── sauvegardes/          # destination des sauvegardes (créé par sauvegarder.bat)
```

## Architecture de la base

- **Une table par entité**, noms en français (`patients`, `ventes`, `articles`,
  `utilisateurs`, `journal_audit`…) : 35 tables + `parametres` + `compteurs` +
  `sequences` (numérotation atomique) + `sessions` (jetons de connexion 12 h).
- Chaque ligne = `id` (PK) + `donnees` (JSON complet, même structure que
  l'application) + références extraites (`numero_ref`, `dossier_ref`) pour les
  requêtes et la détection de doublons + `mis_a_jour` automatique.
- `parametres` : réglages d'impression, factures mensuelles, compteurs JSON.
- `compteurs` : séquences numériques (`factureCounter`…) — **ne diminuent jamais**.

## Protocole de l'API (`api/index.php`)

| Action | Méthode | Rôle |
|---|---|---|
| `?action=info` | GET | heure serveur, versions PHP/schéma (santé rapide) |
| `?action=read_all` | GET | état complet `{ success, datasets }` |
| `?action=sync_all` | POST | sauvegarde `{ datasets, deletions? }` → `{ success }` |

Garanties (voir code pour le détail) :

1. **Transactionnel** : une sauvegarde est entière ou nulle — jamais à moitié écrite.
2. **Pas de vidage implicite** : seules les suppressions *explicites*
   (`deletions`) effacent des lignes ; un poste en retard ne peut pas vider la base.
3. **Compteurs monotones** (`GREATEST`) : un envoi périmé ne fait jamais
   réutiliser un numéro de facture.
4. **Requêtes préparées partout**, noms de tables issus d'une liste fermée,
   identifiants validés, corps limité à 512 Mo (HTTP 413 au-delà).
5. **Erreurs journalisées** dans `api/logs/`, jamais de détail SQL renvoyé au
   client (sauf `SALFA_DEBUG`, développement uniquement).

## Prérequis

- Windows 10/11 + **WAMP 3.3+** (Apache 2.4, **PHP 8+**, **MySQL 8**), icône verte.
- **Node.js 18+** (uniquement sur le PC qui compile `index.html`).
- Recommandé : `post_max_size ≥ 128M`, `memory_limit ≥ 512M`,
  `max_allowed_packet ≥ 128M` (la page diagnostic vérifie tout cela).

## Installation (résumé — détail dans QUICKSTART.md)

1. Importer `database/schema.sql` puis `database/seed.sql` dans phpMyAdmin.
2. Si MySQL a un mot de passe : créer `api/config.local.php` :
   ```php
   <?php
   define('SALFA_DB_PASS', 'votre-mot-de-passe-mysql');
   ```
3. Compiler : `npm install` puis `npm run build:wamp` (racine du projet),
   copier `dist/index.html` → `wamp_deploy/index.html`.
4. Déployer : `outils\deployer.bat` (copie vers `C:\wamp64\www\reception-salfa`).
5. Vérifier : `http://localhost/reception-salfa/api/diagnostic.php` (tout vert).
6. Ouvrir : `http://localhost/reception-salfa/` — se connecter
   (`USR-ADMIN` / `admin123`) puis **changer les mots de passe aussitôt**.

## Mise à jour d'une base existante (v1 → v2)

1. **Sauvegarder** : `outils\sauvegarder.bat` (puis vérifier la sauvegarde).
2. Dans phpMyAdmin (base `reception_salfa`), importer
   `database\migrations\002_sequences.sql` (crée `sequences` + `sessions`,
   passe `schema_version` à 2 ; réimportable sans risque).
3. Redéployer l'API + le nouveau `index.html`, puis ouvrir
   `api/diagnostic.php` : « Version du schéma (v2) » doit être ✅ vert.
4. Chaque compte est migré vers bcrypt **à sa prochaine connexion**
   (les mots de passe actuels continuent de fonctionner).

## Multi-postes (réseau local)

1. Sur le PC serveur : WAMP « En ligne » (*clic droit → Mettre en ligne*) ou
   `Require all granted` sur le dossier dans la config Apache.
2. Pare-feu Windows : autoriser Apache (port 80) sur le réseau privé.
3. Sur chaque poste client : ouvrir `http://<IP-du-serveur>/reception-salfa/`
   (aucune installation sur les clients — tout est dans MySQL).
4. ⚠️ Ne JAMAIS exposer WAMP sur Internet (voir SECURITE.md).

## Sauvegardes (obligatoire, quotidien)

- Lancer `outils\sauvegarder.bat` **chaque jour** (ou le planifier à 23h00 via
  le Planificateur de tâches Windows) + **copier les `.sql` sur un disque externe**.
- Tester la restauration **une fois par mois** sur un PC d'essai
  (`outils\restaurer.bat sauvegarde.sql`).
- Sans sauvegarde externe, une panne disque = perte de tout l'historique.

## Régénérer `index.html` après une mise à jour du code

```bat
npm run build:wamp
copy dist\index.html wamp_deploy\index.html
wamp_deploy\outils\deployer.bat
```

## Limites connues (voir audit `docs/AUDIT_10_ANS.md`)

- Le protocole actuel échange l'état **complet** à chaque synchronisation :
  prévoir l'API incrémentale (Phase 1) et l'archivage des exercices clos
  quand la base dépassera ~1 Go (la page diagnostic alerte).
- L'émission *atomique* des factures mensuelles assurance reste à développer
  côté serveur (réimpression des instantanés existants : OK).
- Mots de passe stockés en clair (compatibilité) : voir SECURITE.md, Phase 1.
