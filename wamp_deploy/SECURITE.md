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
- `.htaccess` : `database/*.sql` et `api/logs/*` **inaccessibles via HTTP** ;
  pas de listage dans `api/`.
- `api/config.local.php` (vos identifiants) : **jamais versionné, jamais écrasé**
  par `deployer.bat`. Ne pas le copier/coller dans des e-mails.
- `database/seed.sql` contient les comptes par défaut : ne pas le laisser
  traîner sur un poste partagé après installation.

## 🟡 Limites connues (Phase 1 — voir `docs/AUDIT_10_ANS.md`)

- **Mots de passe stockés en clair** (compatibilité avec le client actuel) :
  toute personne accédant à MySQL, aux sauvegardes `.sql` ou aux exports
  JSON peut les lire. Prévu : hachage bcrypt + écran de connexion serveur.
- **Pas d'authentification sur l'API** : tout poste du réseau local peut lire
  et écrire la base. C'est acceptable sur un réseau de confiance (switch du
  centre, Wi-Fi avec mot de passe fort), jamais sur un réseau ouvert.
  Préparé : `SALFA_API_KEY` dans la config exige l'en-tête `X-API-Key`
  (à activer avec le client Phase 1 qui l'enverra).
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
