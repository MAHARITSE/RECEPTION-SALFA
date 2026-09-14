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
- `.htaccess` : `database/*.sql` et `api/logs/*` **inaccessibles via HTTP** ;
  pas de listage dans `api/`.
- `api/config.local.php` (vos identifiants) : **jamais versionné, jamais écrasé**
  par `deployer.bat`. Ne pas le copier/coller dans des e-mails.
- `database/seed.sql` contient les comptes par défaut : ne pas le laisser
  traîner sur un poste partagé après installation.

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

## 🟢 Routine d'exploitation

- Sauvegarde quotidienne (`sauvegarder.bat` planifié) + copie externe.
- Test de restauration mensuel sur un PC d'essai.
- Page diagnostic consultée après chaque mise à jour / incident.
- Mises à jour WAMP (PHP/MySQL) : 2 fois par an minimum.
