# SÉCURITÉ — RECEPTION SALFA (WAMP)

> L'application gère des **données de santé** (diagnostics, ordonnances,
> résultats labo). Les règles ci-dessous sont obligatoires.

## 🔴 À faire immédiatement après l'installation

1. **Changer TOUS les mots de passe par défaut** (`admin123`, `doc123`,
   `caisse123`, `pharma123`, `mag123`, `labo123`, `fact123`, `rec123`) :
   connexion `USR-ADMIN` → Administration → Utilisateurs.
   Ils sont publics (dépôt + écran de démo) : tant qu'ils existent,
   n'importe qui peut se connecter.
2. **Créer un compte par personne** (jamais de compte partagé « Caisse ») et
   **désactiver les comptes des départs** (changement de mot de passe +
   suppression du compte).
3. **Ne JAMAIS exposer WAMP sur Internet** : usage en **réseau local uniquement**
   (box/routeur : aucun port redirigé vers le PC serveur ; WAMP « En ligne »
   = réseau local, pas Internet).

## 🟠 Protections déjà en place (ne pas casser)

- `api/index.php` : requêtes préparées PDO, liste fermée de tables,
  validation des identifiants, sauvegarde **transactionnelle**, compteurs
  monotones, corps limité (413), journal `api/logs/`, aucun détail SQL exposé.
- **Mots de passe JAMAIS en clair** : bcrypt côté serveur (migration
  paresseuse depuis les empreintes `sha256:` du client et l'historique en
  clair, dès la première connexion de chaque compte). `read_all` et
  `utilisateurs` ne transmettent **jamais** les mots de passe, même aux
  admins ; `sync_all` préserve toujours celui en base ; les changements
  passent par `action=password` (admin connecté uniquement).
- **Sessions** : `read_all`, `sync_all` et `numero` exigent un jeton de
  session valide (12 h, délivré par `action=login`, table `sessions`) —
  en-tête `X-Session-Token`. Sans session : 401. Même la réception se
  connecte (compte Réception).
- **Numérotation atomique** : `action=numero` attribue les n° de facture sous
  verrou (`SELECT … FOR UPDATE`, table `sequences`) — deux caisses
  n'obtiennent jamais le même numéro. Schéma v2 requis
  (`migrations/002_sequences.sql`) ; à défaut, message explicite.
- **Autorisations côté SERVEUR** (pas seulement dans l'écran) : seule une
  session administratrice peut écrire ou supprimer dans `utilisateurs`
  (comptes et rôles) — un poste « réception » ne peut donc plus promouvoir son
  propre compte en `admin` puis redéfinir les mots de passe de tout le monde.
  Exception : table `utilisateurs` vide (première installation).
- **Journal d'audit en écriture seule** : `journal_audit` est inséré, jamais
  réécrit (`INSERT IGNORE`) par quiconque ; sa purge est réservée à
  l'administration (l'archivage est la bonne pratique : `PERFORMANCE.md` §5).
- **Anti-force brute** : 5 échecs de connexion par compte+IP → blocage 15 min,
  avec journalisation des échecs (`api/logs/`). Le vieux `usleep` de 200 ms par
  essai, qui pouvait lui-même saturer Apache, a été supprimé.
- **Sessions** : jeton accepté uniquement en en-tête `X-Session-Token` (ou dans
  le corps pour `sendBeacon`) — **jamais en paramètre d'URL**, donc plus dans
  `access.log` ni le `Referer`. `action=logout` révoque le jeton ; changer un
  mot de passe révoque toutes les sessions du compte ; un jeton dont le compte a
  été supprimé est refusé (contrôle à chaque appel authentifié).
- **Longueur minimale** : 8 caractères, et refus des mots de passe connus
  (dont ceux du fichier d'installation `reception_salfa_complete.sql` livré).
- **Intégrité multi-postes** : `read_all` s'exécute sous transaction (jamais
  d'état « déchiré ») et renvoie la révision lue ; `sync_all` accepte `if_rev`
  et répond 409 si un autre poste a écrit entre-temps (le client relit et rejoue).
- `.htaccess` : `database/*.sql`, `outils/*.bat`, `api/logs/*`,
  `api/config.local.php` **inaccessibles via HTTP** ; pas de listage de
  répertoire ; en-têtes `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Cache-Control: no-store` ; `LimitRequestBody 256M`.
  À vérifier après chaque déploiement (recette : `PERFORMANCE.md` §7).
- `api/diagnostic.php` n'est plus public : PC serveur (127.0.0.1) ou session
  valide (il expose versions, nom de base, volumes, espace disque).
- `api/config.local.php` (vos identifiants) : **jamais versionné, jamais écrasé**
  par `deployer.bat`. Ne pas le copier/coller dans des e-mails.
- `database/reception_salfa_complete.sql` contient les comptes par défaut :
  ne pas le laisser traîner sur un poste partagé après installation.

## 🟠 À faire sur le serveur (l'application ne peut pas le faire pour vous)

1. **Verrouiller MySQL** : le WAMP par défaut écoute sur tout le réseau avec
   `root` **sans mot de passe** — n'importe quel poste du LAN peut alors lire et
   effacer les dossiers médicaux sans passer par l'application. Exécuter
   `outils/hygiene_mysql.sql`, renseigner `api/config.local.php`, mettre
   `bind-address = 127.0.0.1` dans `my.ini`.
2. **Retirer `reception_salfa_complete.sql` du dossier déployé** une fois
   l'installation faite (il contient les comptes par défaut ; le `.htaccess`
   le bloque, mais un `AllowOverride` oublié l'exposerait).
3. **Deuxième copie des sauvegardes hors du PC serveur**, chiffrée, testée par
   restauration (un `sauvegardes\` sur le même disque ne protège de rien).
4. Ne pas utiliser le bouton « Sauvegarde SQL » de l'application pour restaurer
   dans MySQL : ses noms de tables ne correspondent pas au schéma de l'API
   (détail : `docs/AUDIT_WAMP_100_PAR_JOUR.md` §3, S12). Utiliser
   `outils/sauvegarder.bat`.

## 🟡 Limites connues (résiduelles)

- **Réseau local de confiance requis** : l'API exige désormais une session,
  mais le trafic reste en HTTP (WAMP) : un attaquant SUR le réseau pourrait
  intercepter un jeton. Restez sur le switch du centre / un Wi-Fi à mot de
  passe fort, jamais sur un réseau ouvert. Renfort possible : `SALFA_API_KEY`
  (en-tête `X-API-Key` exigé en plus — le client actuel ne l'envoie pas
  encore : à activer avec un client adapté).
- **Journal d'audit modifiable** par un administrateur (même base) :
  la preuve d'antériorité repose sur les **sauvegardes quotidiennes externes**.
- **Chiffrement** : activer le chiffrement du disque Windows (BitLocker) sur
  le PC serveur + un mot de passe de session. Les sauvegardes `.sql`
  contiennent toutes les données : disque externe **chiffré et verrouillé**.
- **Le fichier `.sql` téléchargé par l'application** (bouton *Sauvegarder*,
  Administration, ou automatique à la déconnexion) = une copie complète du
  dossier médical et de la caisse. Même régime que `mysqldump` :
  - il ne contient **jamais** de mot de passe en clair (les mots de passe de
    l'application Web sont filtrés à l'écriture ; un hachage serveur bcrypt/
    `sha256:` n'est conservé que si le poste le détient, et une importation ne
    remplace **pas** le mot de passe déjà en base) ;
  - il contient **tout le reste** (noms, diagnostics, factures, messages) →
    ne pas le laisser sur le Bureau ni dans un dossier partagé, le ranger sur le
    disque chiffré et le supprimer après restauration ;
  - une restauration se fait **hors heures d'ouverture** (le fichier fige l'état
    d'un instant donné ; les postes qui continuent d'écrire après l'export
    verraient leurs lignes écrasées par l'import).

## 🟢 Routine d'exploitation

- Sauvegarde quotidienne (`sauvegarder.bat` planifié) + copie externe.
- Test de restauration mensuel sur un PC d'essai.
- Page diagnostic consultée après chaque mise à jour / incident.
- Mises à jour WAMP (PHP/MySQL) : 2 fois par an minimum.
