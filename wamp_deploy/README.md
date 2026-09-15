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
│   ├── index.php         # API : info / poll / read_all / sync_all / numero / login / logout / password
│   ├── diagnostic.php    # page de santé : http://localhost/reception-salfa/api/diagnostic.php
│   ├── config.php        # identifiants MySQL par défaut (ne pas modifier)
│   ├── config.local.php  # VOS identifiants (à créer depuis config.local.php.exemple ; jamais versionné)
│   ├── lib.php           # fonctions partagées (tables, PDO, journal)
│   └── logs/             # journaux d'erreurs (inaccessibles via HTTP)
├── database/
│   ├── reception_salfa_complete.sql  # LE SEUL fichier à importer : schéma v3 complet
│   │                                 # (35 tables + parametres + compteurs + sequences
│   │                                 # + sessions + revision) + données initiales
│   │                                 # (comptes par défaut, familles, services…)
│   └── migrations/       # bases existantes seulement : 002_sequences.sql (v1→v2), 003_performance.sql (v2→v3)
├── outils/
│   ├── deployer.bat      # copie vers C:\wamp64\www\reception-salfa
│   ├── sauvegarder.bat   # sauvegarde mysqldump + rotation (à planifier ; voir PERFORMANCE.md §6)
│   ├── hygiene_mysql.sql # compte applicatif + verrouillage de root (à faire à l'installation)
│   ├── test_charge.php   # banc d'essai : limites réelles du serveur et date de franchissement
│   └── restaurer.bat     # restauration (avec confirmation OUI)
├── config/               # blocs php.ini et my.ini prêts à coller (wamp-salfa-*.ini.txt)
└── sauvegardes/          # destination des sauvegardes (créé par sauvegarder.bat)
```

## Architecture de la base

- **Une table par entité**, noms en français (`patients`, `ventes`, `articles`,
  `utilisateurs`, `journal_audit`…) : 35 tables + `parametres` + `compteurs` +
  `sequences` (numérotation atomique) + `sessions` (jetons de connexion 12 h) +
  `revision` (sondage léger : les postes ne relisent la base que si elle a changé).
- Index `idx_maj (mis_a_jour)` sur les 35 tables : prérequis d'une lecture
  incrémentale et du contrôle d'antériorité.
- Chaque ligne = `id` (PK) + `donnees` (JSON complet, même structure que
  l'application) + références extraites (`numero_ref`, `dossier_ref`) pour les
  requêtes et la détection de doublons + `mis_a_jour` automatique.
- `parametres` : réglages d'impression, factures mensuelles, compteurs JSON.
- `compteurs` : séquences numériques (`factureCounter`…) — **ne diminuent jamais**.

## Protocole de l'API (`api/index.php`)

| Action | Méthode | Rôle |
|---|---|---|
| `?action=info` | GET | heure serveur, versions PHP/schéma (santé rapide) |
| `?action=poll` | GET | révision de la base : « faut-il relire ? » (quelques octets) |
| `?action=read_all` | GET | état complet `{ success, datasets, rev }` (instantané cohérent) |
| `?action=sync_all` | POST | sauvegarde `{ datasets, deletions?, if_rev? }` → `{ success, rev }` ; 409 en cas de conflit |
| `?action=numero` | POST | ordres de facture atomiques (table `sequences`, verrou) |
| `?action=utilisateurs` | GET | liste publique des comptes (écran de connexion), sans mots de passe |
| `?action=login` | POST | authentification bcrypt → jeton de session 12 h (5 échecs = blocage 15 min) |
| `?action=logout` | POST | révocation immédiate du jeton |
| `?action=password` | POST | redéfinition d'un mot de passe (admin ; révoque les sessions du compte) |

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
6. **Autorisations côté serveur** : `utilisateurs` (comptes et rôles) réservé à
   l'administration (sauf table vide, à l'installation) ; `journal_audit` en
   écriture seule (`INSERT IGNORE`) ; purge du journal réservée à l'admin.
7. **Anti-écrasement entre postes** : `if_rev` → HTTP 409 si un autre poste a
   écrit depuis notre lecture ; le client relit, refusionne et rejoue.
8. **Session** : jeton en en-tête (jamais en URL), compte obligatoirement encore
   présent en base, révocation au `logout` et au changement de mot de passe.

## Prérequis

- Windows 10/11 + **WAMP 3.3+** (Apache 2.4, **PHP 8+**, **MySQL 8**), icône verte.
- **Node.js 18+** (uniquement sur le PC qui compile `index.html`).
- **Requis** (défauts WAMP insuffisants à 100 passages/jour) : `memory_limit ≥ 1G`,
  `post_max_size ≥ 256M`, `max_allowed_packet ≥ 64M`, `innodb_buffer_pool_size ≥ 1G`,
  `log_bin` coupé. Blocs prêts à coller : `config/wamp-salfa-*.ini.txt`,
  mesures : `outils/test_charge.php` (détail : `PERFORMANCE.md`).

## Installation (résumé — détail dans QUICKSTART.md)

1. Importer **`database/reception_salfa_complete.sql`** dans phpMyAdmin
   (onglet *Importer*) : c'est le fichier unique — il crée la base, le schéma
   v3 et les données initiales (comptes par défaut, familles, services…).
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

## Mise à jour d'une base existante (v1 → v2 → v3)

1. **Sauvegarder** : `outils\sauvegarder.bat` (puis vérifier la sauvegarde).
2. Dans phpMyAdmin (base `reception_salfa`), importer dans l'ordre,
   selon la version relevée par `api/diagnostic.php` :
   - `database\migrations\002_sequences.sql` (v1 → v2 : `sequences` + `sessions`) ;
   - `database\migrations\003_performance.sql` (v2 → v3 : `revision` + index
     `idx_maj` sur les 35 tables — à faire HORS HEURES D'OUVERTURE, quelques
     dizaines de secondes sur une base de 100 000 lignes).
   Les deux sont réimportables sans risque.
3. Redéployer l'API + le nouveau `index.html`, puis ouvrir
   `api/diagnostic.php` : « Version du schéma (v3) » doit être ✅ vert, ainsi que
   « Révision d'état (poll léger) ».
4. Chaque compte est migré vers bcrypt **à sa prochaine connexion**
   (les mots de passe actuels continuent de fonctionner). Sans migration 003,
   l'application reste utilisable : chaque poste retombe sur la relecture
   complète toutes les 5 secondes (comportement v2).

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
- **Côté application** : le bouton **Sauvegarder** de la barre supérieure (et
  Administration → Données) télécharge un fichier `reception_salfa_sauvegarde_*.sql`
  au **même format que le schéma** (tables en français, colonne `donnees` JSON) :
  il s'importe donc directement dans `reception_salfa`
  (`outils\restaurer.bat mon_fichier.sql`, ou phpMyAdmin → Importer). Idempotent et
  sans `DELETE` : il ajoute ou met à jour, il ne supprime rien — un fichier ancien
  restauré sur une base récente fait donc réapparaître des lignes supprimées depuis.
  Au-delà de ~150 Mo estimés, l'onglet refuse de produire le fichier et renvoie
  vers `mysqldump` (le navigateur ne peut pas sérialiser l'état entier).
- Un export fait par un **administrateur** contient les hachages de mots de passe
  (ils vivent dans `utilisateurs.donnees`) : ces fichiers sont confidentiels, comme
  les dumps `mysqldump`. Aucun mot de passe en clair n'est jamais écrit.

## Régénérer `index.html` après une mise à jour du code

```bat
npm run build:wamp
copy dist\index.html wamp_deploy\index.html
wamp_deploy\outils\deployer.bat
```

## Limites connues (audits : `docs/AUDIT_10_ANS.md` et `docs/AUDIT_WAMP_100_PAR_JOUR.md`)

- **Échange d'état** : la sonde `poll` + l'envoi différentiel ont supprimé le
  gaspillage cyclique, mais la **première** relecture (`read_all` à la connexion)
  reste un transfert de toute la base : au-delà de ~150 Mo, l'API incrémentale
  (audit §7.1) et l'archivage annuel (PERFORMANCE.md §5) deviennent nécessaires.
  La page `diagnostic.php` annonce la marge restante en jours.
- Écrans sans pagination ni virtualisation : le rendu navigateur décroît dès
  quelques dizaines de milliers de lignes (audit §2.4 G3).
- Trafic en HTTP (pas de TLS) : réseau local uniquement ; voir SECURITE.md.
- L'émission *atomique* des factures mensuelles assurance reste à développer
  côté serveur (réimpression des instantanés existants : OK).
- Mots de passe : bcrypt côté serveur, migration paresseuse depuis l'historique
  en clair ; minimum 8 caractères et liste noire des mots de passe par défaut.
