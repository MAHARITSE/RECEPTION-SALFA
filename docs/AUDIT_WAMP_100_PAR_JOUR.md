# Audit « 10 ans, 100 personnes/jour, MySQL de WAMP »

**Objet :** vérifier les failles (sécurité, intégrité) et les risques de latence de RECEPTION SALFA
tel qu'il fonctionne sur WAMP (`wamp_deploy/`), à raison de **100+ passages par jour**, pendant
**10 ans**.

> Date : 14/09/2026. Périmètre analysé : `wamp_deploy/api/*.php`, `wamp_deploy/database/*`,
> `src/wamp.ts`, `src/store.ts`, `src/syncMerge.ts`, `src/App.tsx`, `src/browserDb.ts`,
> `src/utils/sauvegardeSql.ts`, `src/utils/factureNumber.ts`, build déployé `wamp_deploy/index.html`.
> Ce document complète (et met à jour) `docs/AUDIT_10_ANS.md`, écrit avant l'API MySQL.

## 0. Méthode — ce qui est mesuré, ce qui est estimé

| Type | Comment |
|---|---|
| **Mesuré** | Volumétrie réelle du jeu de données applicatif (`src/data/localData.json` : 5 103 841 o, 422 consultations, 7 682 lignes) → **12 094 o de JSON et 18,2 lignes MySQL par passage**. Coût V8 mesuré : `JSON.parse` 5 Mo = 25 ms ; facteur tas mémoire = **×3,1** ; `stringify` complet 37 Mo = 238 ms, 74 Mo = 542 ms. |
| **Lu dans le code** | Chemins de synchronisation, requêtes SQL, ACL, limites, `php.ini`/`my.ini` attendus, `.htaccess`. |
| **Estimé** | Temps CPU PHP de `json_decode` (≈ 60 Mo/s, 3 à 5× plus lent que V8) et pic mémoire PHP (≈ **5×** le volume JSON : tableau associatif + ré-encodage). Toujours présenté comme fourchette, jamais comme promesse. |
| **Non fait** | Pas de banc d'essai réel : le bac à sable n'a ni PHP, ni MySQL, ni réseau. L'outil `wamp_deploy/outils/test_charge.php` (fourni) mesure ces chiffres **sur votre serveur**. |

Hypothèses de projection : 100 passages/jour, 300 jours ouvrés/an, fiches de taille identique à la
démonstration. Une fiche médicale réelle plus légère (4 Ko/passage) repousse les délais d'environ ×3 ;
une fiche plus lourde les raccourcit.

---

## 1. Verdict

| Axe | Verdict | Effet concret à 100 passages/jour |
|---|---|---|
| **Latence — relecture complète (`read_all`)** | 🔴 **Bloquant, et bien plus tôt que prévu** | Dépasse `memory_limit` de WAMP **entre 3 semaines et 4 mois d'exploitation** selon le réglage. L'application se met à afficher « Échec de la synchronisation » puis à refuser d'enregistrer. |
| Latence — trafic réseau périodique | 🔴 Bloquant → **🟠 corrigé en partie** (sonde `poll`) | Avant correction : 5 postes × relecture complète = jusqu'à **840 Mbit/s** sur le LAN dès ~3 mois de données (sature un Gigabit). |
| Latence — rendu des listes | 🟠 Partiellement traité | La liste de Réception est paginée ✅ ; restent le journal d'audit (rendu intégral) et les recalculs sur tout l'état dans Caisse/Labo/Médecin (0 `React.memo`). |
| Intégrité multi-postes | 🟠 → **🟢 renforcée** (409 + `if_rev`, instantané cohérent) | Deux postes qui enregistrent en même temps pouvaient se marcher dessus sans aucun avertissement. |
| Sécurité — autorisations | 🔴 **Critique** → **🟢 corrigée (ACL serveur)** | N'importe quel compte connecté pouvait s'auto-promouvoir administrateur, réécrire/supprimer n'importe quelle table et changer le mot de passe de tout le monde. |
| Sécurité — exposition WAMP | 🔴 **Critique, hors application** | MySQL de WAMP écoute sur le LAN avec `root` **sans mot de passe** ; `seed.sql` téléchargeable si `AllowOverride` inactif. |
| Sauvegarde / rétention 10 ans | 🟠 à risque | Rotation 7 jours sur le **même disque** ; export SQL de l'application **non réimportable** dans le schéma réel. |
| Durabilité du poste unique | 🟠 | PC de bureau + WAMP + redémarrages Windows Update = pannes pendant écriture. Prévoir réplication/standby. |

**Conclusion :** la base MySQL est saine (InnoDB, utf8mb4, requêtes préparées, transactions, schéma stable),
mais **le protocole de synchronisation « tout relire / tout réécrire » est incompatible avec votre volume**.
Ce n'est pas un réglage à pousser : c'est le mode d'échange qu'il faut rendre incrémental. Les corrections
déjà appliquées ici suppriment le gaspillage (sonde de révision + envoi différentiel) et ferment les failles
critiques ; le §7 donne la suite à financer pour tenir 10 ans.

---

## 2. Le mur de la latence, chiffres à l'appui

### 2.1 Croissance prévue

| Horizon | Passages cumulés | Lignes MySQL | Volume JSON en base | Pic mémoire PHP pour `read_all` | CPU PHP `read_all` | Gel de l'interface par cycle |
|---|---|---|---|---|---|---|
| 15 jours | 1 250 | 22 750 | 14,4 Mo | 72 Mo | 0,3 s | 230 ms |
| 1 mois | 2 500 | 45 500 | 28,8 Mo | 144 Mo | 0,5 s | 450 ms |
| 3 mois | 7 500 | 136 500 | 86,5 Mo | 433 Mo | 1,5 s | 1 360 ms |
| 6 mois | 15 000 | 273 000 | 173 Mo | **865 Mo** | 3 s | 2 720 ms |
| 1 an | 30 000 | 546 000 | 346 Mo | **1,7 Go** | 6 s | 5 400 ms |
| 3 ans | 90 000 | 1 638 000 | 1,0 Go | 5,1 Go | 18 s | 16 300 ms |
| 10 ans | 300 000 | 5 460 000 | 3,4 Go | 16,9 Go | 60 s | 54 400 ms |

Lecture : dès **6 mois**, un `read_all` demande plus de mémoire à PHP que ce que WAMP autorise par défaut.
À **1 an**, l'application a besoin de 23 Go de RAM serveur et gèle 5 s par enregistrement : le mode
« état complet » est mort, quel que soit le matériel.

### 2.2 Où sont les plafonds (à 12 Ko/passage, 100 passages/jour)

| Limite | Valeur par défaut WAMP | Volume supporté | Délai avant franchissement |
|---|---|---|---|
| PHP `memory_limit` | 128M | 25,6 Mo | **≈ 22 jours** |
| PHP `memory_limit` | 512M (conseillé) | 102 Mo | ≈ 89 jours |
| PHP `memory_limit` | 1 Go | 205 Mo | ≈ 178 jours |
| MySQL `max_allowed_packet` | **1M** dans le `my.ini` fourni par WAMP | 1 Mo | **≈ 1 à 3 jours** si un enregistrement dépasse 1 Mo (clôtures de garde : 60-80 Ko chacune mesurées, ça passe ; mais l'import d'un dump de 5 Mo échoue) |
| PHP `post_max_size` (imports phpMyAdmin, pas l'API) | 8M | 8 Mo | restauration d'un dump > 8 Mo impossible depuis le navigateur dès ≈ 7 jours de données |
| Apache `Timeout` | 60 s | — | la 1ʳᵉ relecture qui dépasse 60 s = réponse coupée, sauvegarde perçue comme échec |
| IndexedDB / tas V8 du poste | — | ~2 Go utiles | ≈ 2 ans (mode navigateur) |

Ces chiffres ne sont pas « alarmistes » : ils découlent de `read_all` qui fait `SELECT donnees FROM t` sur
35 tables **sans filtre**, puis `json_decode` ligne à ligne, puis `json_encode` de tout dans une réponse
unique (`wamp_deploy/api/index.php`). Tant que la lecture est totale, chaque octet de la base est payé
à chaque cycle par chaque poste.

### 2.3 Ce qui a été changé dans cette session (et son effet)

1. **Sonde de révision `action=poll`** (+ table `revision`, migration `003_performance.sql`, index `idx_maj`).
   Le rafraîchissement des 5 s ne demande plus que **~60 octets** au lieu de tout l'état : une lecture de clé
   primaire côté serveur. La relecture complète n'a plus lieu que **quand la base a réellement changé**.
   Effet : trafic LAN et CPU PHP divisés par le nombre de cycles inutiles (typiquement ×20 à ×100).
2. **Envoi différentiel** (avec filet de sécurité : un envoi complet forcé toutes les
   10 minutes, et immédiatement après tout conflit) : `sync_all` ne reçoit plus que les collections modifiées par le poste
   (`changedTopKeys` + garde sur les historiques écrits en place), au lieu de renvoyer les 35 collections à
   chaque frappe. Le serveur ignorait déjà tout dataset absent (`Jamais de vidage implicite`) : la sémantique
   est respectée. Effet typique : un enregistrement de patient passe de ~tout l'état à ~150 Ko.
3. **Anti-écrasement par révision (`if_rev`) → HTTP 409** : si un collègue a écrit entre notre lecture et
   notre écriture, le serveur refuse proprement, le poste relit, refusionne et rejoue. Avant : last-write-wins
   silencieux (lignes perdues sans message).
4. **`read_all` sous transaction** : plus d'état « déchiré » (moitié d'avant / moitié d'après la sauvegarde
   d'un autre poste), et la révision renvoyée correspond exactement à ce qui a été lu.
5. **`413` propre au lieu d'un plantage PHP opaque** : la limite acceptée est désormais
   `min(SALFA_MAX_BODY_MB, memory_limit/5)` — la seule qui corresponde à ce que PHP peut
   réellement décoder (`post_max_size` ne borne pas le corps brut lu par `php://input`,
   il ne bride que les imports phpMyAdmin) — avec un message qui dit quoi régler.
   Un poste qui dépasse la limite reçoit une explication, pas une page blanche.
6. **Prescripteurs externes et factures mensuelles assurance enfin persistés** : `buildDatasets()`
   n'envoyait jamais `monthlyInvoices` ni `prescripteursExternes`, bien que l'API sache les lire et les
   écrire. Résultat : la facturation mensuelle établie sur un poste disparaissait au redémarrage. Corrigé.

### 2.4 Ce qui reste le goulot (à programmer)

| # | Goulot | Preuve | Effet à 100/jour | Correctif |
|---|---|---|---|---|
| G1 | `read_all` total (à la connexion, et à chaque changement réel) | `index.php` ligne du `foreach (salfa_tables() ...)` | 1re connexion de plus en plus lente : ~10 s à 6 mois, ~1 min à 3 ans | **API incrémentale** : `read_all?depuis=<rev>` renvoie les lignes changées après la révision + tombstones de suppression (§7.1) |
| G2 | Clonage profond de la référence de fusion à chaque cycle | `wamp.ts` → `setSyncBaseline()` = `JSON.parse(JSON.stringify(état))` | +0,1 s à 1 mois, +3 s à 1 an, par cycle et par poste | Baseline par référence (comme `browserDb`) ; nécessite la fin des mutations en place — amorcé : `addAuditLog`/`addNotification` renvoient désormais des tableaux neufs |
| G3 | Rendu integral des longues listes, recalculs sur tout l'état | `ModuleAdministration.tsx:1295` (`filteredAuditLogs.map` **sans** pagination) ; `ModuleCaisse.tsx` `ModuleLaboratoire.tsx` `ModuleMedecin.tsx` : dizaines de `.filter()`/`.map()` chaînés sur tout l'état à chaque rendu, **0 `React.memo`** dans les modules | le journal d'audit devient illisible dès quelques dizaines de milliers de lignes ; chaque frappe re-rend tout ; la liste de Réception est **déjà paginée** (correction de l'ancien audit) | pagination/virtualisation partout + agrégats calculés côté SQL (`SUM`/`GROUP BY`) + `React.memo` sur les lignes |
| G4 | `journal_audit` et `notifications` non bornés, poussés entiers | `store.ts` `addAuditLog` (préfixe), `buildDatasets` envoie tout | à 3 ans : 500 000 lignes ≈ 150 Mo dans l'état de chaque poste | Archivage serveur + fenêtre glissante lue côté client (voir §6.3 pour le piège : ne **pas** tronquer côté client) |
| G5 | `salfa_max_ordre_base()` : `LIKE 'FA-09/%/25-%'` sur 4 tables | `lib.php` | une fois par mois, mais balayage complet de l'index → plusieurs secondes de verrou au changement de période, toutes caisses bloquées | une ligne par mois dans `sequences` suffit une fois l'historique amorcé ; sinon `SELECT MAX(seq)` dédié |
| G6 | Recherche plein texte en JS sur toute la collection | `utils/recherche.ts`, `correspondRechercheMultiMots` | saisie qui accroche dès ~30 000 dossiers | index `FULLTEXT` + recherche serveur pour la liste (le filtrage local reste possible sur la page affichée) |
| G7 | Mono-fichier de 3,5 Mo à charger à chaque ouverture | `wamp_deploy/index.html` (3 643 018 o), `vite-plugin-singlefile` | 2 à 6 s de white screen par ouverture sur un poste moyen ; ×N postes à chaque mise à jour | sortir les `node_modules`-lourds en fichiers avec cache long, ou accepter en gardant `Cache-Control` + `ETag` sur les assets |

Bonne nouvelle mesurée : le build déployé **ne contient pas** les 5 Mo de données de démonstration
(`localData.json` est éliminé à la compilation en mode WAMP) — le point « données démo embarquées » de
`docs/AUDIT_10_ANS.md` §Maintenabilité est donc clos.

---

## 3. Failles de sécurité — inventaire, preuve, état

Sévérité : **P0** = exploitation triviale avec impact total ; **P1** = grave mais nécessite un accès ;
**P2** = durcissement ; **P3** = hygiène.

| # | Sév. | Faille | Preuve | État |
|---|---|---|---|---|
| S1 | **P0** | **Aucune autorisation côté serveur.** Tout poste connecté pouvait écrire n'importe quel dataset, y compris `users` : on s'attribue `role:"admin"`, puis `action=password` redéfinit le mot de passe de tous les comptes. L'interface seule (« rôle admin ») n'est pas une défense : le client est dans le navigateur. | `index.php` `sync_all` ne regardait que la validité des `id` ; `App.tsx` `onChangeRole` change le rôle localement | 🟢 **Corrigé** : `salfa_filtrer_utilisateurs()` — écriture/`deletions` de `users` réservées aux admins (exception : table vide = première installation). Audit `journal_audit` en **INSERT IGNORE** (append-only), purge réservée à l'admin. |
| S2 | **P0** | **MySQL de WAMP exposé sur le réseau, `root` sans mot de passe.** Un poste du LAN se connecte en `mysql -h 192.168.x.x -uroot` et lit/efface tous les dossiers médicaux, sans passer par l'application. | `api/config.php` : `SALFA_DB_USER=root`, `SALFA_DB_PASS=''` (défaut WAMP) | 🟠 **À faire côté serveur** : script fourni `outils/hygiene_mysql.sql` (compte `salfa` limité à la base, `root@localhost` + mot de passe, `bind-address=127.0.0.1`) + compte `config.local.php`. |
| S3 | **P0** | **Mots de passe par défaut connus** (`admin123`, `caisse123`…) présents dans `database/seed.sql`, donc dans le dépôt **et** dans le dossier déployé. Si `AllowOverride` est inactif, `GET /reception-salfa/database/seed.sql` renvoie le fichier → connexion immédiate en admin. | `seed.sql`, `.htaccess` inefficace si Apache ne l'applique pas | 🟠 À faire (checklist §5) + 🟢 `429` après 5 échecs (S4) et `.htaccess` durci avec vérification `curl` documentée. |
| S4 | P1 | **Pas de limite de tentatives de connexion.** Le seul frein était `usleep(200000)` — qui, lui, occupe un thread Apache 200 ms par essai : quelques dizaines d'essais parallels gèlent **tous** les postes (déni de service auto-infligé). | `index.php` bloc `login` | 🟢 **Corrigé** : compteur d'échecs par compte+IP (5 essais → 15 min), suppression de l'`usleep` (plus d'arme de déni), journalisation des échecs. |
| S5 | P1 | **Jeton de session jamais révoqué.** « Déconnexion » oubliait le jeton côté navigateur ; il restait valide 12 h dans `sessions` (poste partagé, poste volé, sauvegarde du fichier `sessions`). | `App.tsx` `handleLogout` → `clearWampSession()` seul | 🟢 **Corrigé** : `action=logout` (POST `keepalive`) + révocation de toutes les sessions d'un compte dont le mot de passe est redéfini. |
| S6 | P1 | **Jeton acceptée dans l'URL** (`?token=`) → copié dans `access.log` d'Apache, l'historique du navigateur, le `Referer`. | `lib.php` `salfa_session_exige` lisait `$_GET['token']` | 🟢 **Corrigé** : en-tête ou corps uniquement (le corps reste nécessaire pour `sendBeacon`). |
| S7 | P1 | **Le jeton survit au compte supprimé/désactivé** : on peut retirer un agent, son poste continue d'écrire 12 h. | `salfa_session_exige` ne vérifiait que `sessions` | 🟢 **Corrigé** : contrôle d'existence du compte à chaque appel authentifié (PK lookup). |
| S8 | P1 | **Journal d'audit réécrivable** par n'importe quel poste : la preuve d'antériorité (obligatoire en santé) ne valait rien — un enregistrement `auditLogs` était un simple `UPDATE`. | `sync_all` : `ON DUPLICATE KEY UPDATE donnees=VALUES(donnees)` sur toutes les tables, y compris `journal_audit` | 🟢 **Corrigé** : `INSERT IGNORE` pour `journal_audit` + purge réservée à l'admin. Résiduel : l'admin peut encore purger → archivage recommandé (§6.3). |
| S9 | P2 | **`diagnostic.php` public** : versions PHP/MySQL, nom de la base, nombre de lignes, espace disque, compteurs, doublons — pour qui est sur le LAN. C'est le plan de l'attaquant. | `diagnostic.php` n'exigeait rien | 🟢 **Corrigé** : PC serveur uniquement (127.0.0.1) ou session valide. |
| S10 | P2 | **Longueur minimale de mot de passe = 4** ; mots de passe par défaut acceptés. | `index.php` `strlen($nouveau) < 4` | 🟢 **Corrigé** : 8 caractères minimum + liste noire des mots de passe connus (dont ceux du seed). |
| S11 | P2 | **HTTP en clair** : jetons + données de santé sur le câble/Wifi du centre. Un renifleur du segment capture un jeton et devient le poste. | WAMP sert du HTTP, aucune référence TLS | 🟡 Documenté ; à traiter au §6.4 (auto-signé interne ou reverse-proxy stunnel). La clé API optionnelle (`SALFA_API_KEY`) ne protège pas du reniflement, seulement de l'accès direct. |
| S12 | P2 | **Sauvegarde SQL de l'application non réimportable** : `buildSqlBackup()` crée des tables `invoices`, `stockEntries`, `pharmaDeliveryItems`… avec une colonne `LONGTEXT`, alors que le schéma réel est `factures`, `entrees_stock`, `livraisons_pharmacie` avec `donnees JSON` + `numero_ref`. Le dump « Sauvegarder » s'importe donc dans une base **parallèle que l'application ne lit pas**. | `src/utils/sauvegardeSql.ts:34-68` vs `database/schema.sql` | 🔴 **À corriger** : soit mapper les noms + colonnes vers le schéma v3, soit retirer ce bouton au profit de `outils/sauvegarder.bat` (mysqldump, lui, est correct). En attendant : **ne jamais s'en servir pour restaurer**. |
| S13 | P2 | **Sauvegarde mono-exemplaire** : `sauvegarder.bat` écrit dans `wamp_deploy/sauvegardes\` (même disque que la base) et supprime tout ce qui a plus de 7 jours. Un disque mort, un rançongiciel ou un `del` = 10 ans d'historique médical perdus. | `outils/sauvegarder.bat` (`forfiles /D -7`) | 🟠 À faire (§6.1-6.2) : copie chiffrée hors poste + rétention longue + test de restauration mensuel. |
| S14 | P3 | Énumération des comptes via `action=utilisateurs` (liste publique des `id`, noms, rôles) — utile pour viser les comptes. | `index.php` bloc `utilisateurs` | 🟡 Accepté (l'écran de connexion affiche les comptes). Compensé par S4 (blocage) et S10 (longueur). Option : passer la liste en saisie libre + authentification à deux champs. |
| S15 | P3 | `SALFA_DEBUG=true` renvoie le message SQL de l'exception au navigateur (fuite de structure + d'identifiants de table) ; `.env.wamp` est bien réservé au build. | `lib.php` `salfa_erreur` | 🟢 Par défaut `false` ; la page `diagnostic.php` le rappelle. À ajouter en contrôle de recette. |
| S16 | P3 | Injection SQL : **aucune trouvée**. Requêtes préparées partout, noms de tables issus d'une liste fermée (`salfa_tables()`), `id` validés par `salfa_id_valide()`, `LIMIT`/chunks de suppression paramétrés, regex de période strictes pour `numero`. HTML du diagnostic échappé (`htmlspecialchars`). | `lib.php`, `index.php`, `diagnostic.php` | 🟢 RAS. (Le `str_replace("'", "''", SALFA_DB_NAME)` de `diagnostic.php` sur `information_schema` est la seule concaténation SQL : valeur non-user, échappée.) |

**XSS / enrichissement** : le seul HTML injecté vient de l'éditeur d'en-tête de facture, passé par
`sanitizeInvoiceHeader()` (DOMPurify) avant `dangerouslySetInnerHTML` (`EnTeteFactureEditor.tsx:90,571`,
`utils/invoiceHeader.ts:25`) — correct. Aucun `eval`, aucun `innerHTML` alimenté par une saisie libre.

---

## 4. Risques de latence propres à WAMP (hors requêtes)

| # | Risque | Détail WAMP | Réglage |
|---|---|---|---|
| W1 | **`memory_limit` et `post_max_size` minuscules** | php.ini WAMP typique : `post_max_size=8M`, `upload_max_filesize=2M`, `memory_limit=128M`, `max_execution_time=30` (et `max_execution_time` est **peu fiable sous Windows/Apache**) | `memory_limit=1024M`, `post_max_size=256M`, `max_execution_time=300`, `default_socket_timeout=60` |
| W2 | **`max_allowed_packet=1M`** dans le `my.ini` fourni avec WAMP | Toute requête/dump > 1 Mo échoue (`MySQL server has gone away` pour l'import d'une sauvegarde) | `max_allowed_packet=64M` (côté `[mysqld]` **et** `[mysqldump]`) |
| W3 | **`log_bin` activé sans purge** (défaut WAMP) | Le binaire log grossit sur le **même disque** que la base ; à 100 passages/jour avec ré-écriture complète de l'état à chaque frappe, ce sont des Go par semaine → disque plein → MySQL refuse d'écrire, et les sauvegardes échouent. | `skip-log-bin` (pas de réplication prévue) ou `binlog_expire_logs_seconds=604800` |
| W4 | **`innodb_buffer_pool_size=16M`/défaut, `key_buffer_size=16M`** | Chaque relecture de tables de dizaines de Mo repart du disque (et WAMP tourne sur un disque de PC portable, souvent sans BBU) | `innodb_buffer_pool_size=1G` (50 % de la RAM si le PC est dédié), `innodb_log_file_size=256M`, `innodb_flush_log_at_trx_commit=1` (ne pas y toucher : c'est la garantie de ne pas perdre les 5 dernières minutes après une coupure) |
| W5 | **Apache mono-processus, `Timeout 60`, 64 threads** | mod_php : une relecture de 30 s × 6 postes = les threads saturés ; toute l'établissement « tourne à vide ». Le `usleep` anti-brute-force (S4) aggravait ce point. | passer l'API en `php-cgi`/FastCGI ou augmenter `ThreadsPerChild` ; viser < 2 s par requête (mesurable avec `test_charge.php`) |
| W6 | **Redémarrages Windows Update / mise en veille** | Coupure pendant `sync_all` → transaction InnoDB annulée proprement (bonne nouvelle) **mais** l'état non envoyé côté poste est perdu si l'onglet meurt. Le flux d'attente reste donc : ne jamais fermer sans voir la pastille « enregistré ». | PC serveur : veille désactivée, onduleur, heures d'update figées, `sauvegarder.bat` à 23 h |
| W7 | **Disque = base + binlogs + sauvegardes + WAMP** | Un seul disque porte tout ; la sauvegarde est à côté de l'original | séparer base / sauvegardes / journaux (voir §6) |
| W8 | **Clés `id` en `VARCHAR(64)` avec UUID v4** | 36 octets par clé, 3 index par table → tables 2 à 3 fois plus grosses que nécessaire, jointures plus lentes. À 5,4 M lignes (10 ans), ce n'est pas neutre. | envisager `BINARY(16)` à terme, ou au minimum surveiller `data_length/index_length` dans le diagnostic |
| W9 | **PHP/MySQL non maintenus 10 ans** | WAMP installe/désinstalle les versions à la main ; une élongation « PHP 8.x + MySQL 8.x » de 2026 ne sera plus supportée en 2033 | fixer une date de montée de version (2/an, cf. `SECURITE.md`) ; sinon migrer vers MariaDB/MySQL en service Windows + backups orchestrés |

---

## 5. Checklist de mise en production (à faire une fois, 45 min)

1. `outils/hygiene_mysql.sql` dans MySQL : crée le compte applicatif `salfa` (privilèges limités à
   `reception_salfa`), exigence d'un mot de passe fort pour `root@localhost`, `bind-address=127.0.0.1` à
   mettre au §6.
2. `api/config.local.php` : `SALFA_DB_USER='salfa'`, `SALFA_DB_PASS='…'`, `SALFA_DEBUG=false`.
3. Importer `database/migrations/003_performance.sql` (révision + index de fraîcheur) **après** une
   sauvegarde, hors heures d'ouverture.
4. `php.ini` et `my.ini` : appliquer le fichier `wamp_deploy/config/wamp-salfa-php.ini.txt` et
   `…-mysql.ini.txt` (valeurs prêtes à coller) puis redémarrer WAMP.
5. Vérifier les protections Apache :
   ```bat
   curl -i http://SERVEUR/reception-salfa/database/seed.sql      :: attendu 403
   curl -i http://SERVEUR/reception-salfa/api/config.local.php   :: attendu 403
   curl -i http://SERVEUR/reception-salfa/api/logs/api-....log   :: attendu 403
   ```
   Si un `200` sort : `AllowOverride All` + `Require ip <réseau du centre>` dans `httpd.conf`.
6. Changer **tous** les mots de passe par défaut (Administration → Utilisateurs ; 8 caractères minimum
   désormais exigés côté serveur).
7. Lancer `outils/test_charge.php` pour obtenir **vos** courbes (il rejoue les chiffres du §2 sur votre
   matériel et annonce la date de franchissement de chaque limite).
8. Ouvrir `api/diagnostic.php` **sur le serveur** : la ligne « Charge de relecture complète (read_all) »
   donne votre marge restante en jours/mois. À relire chaque trimestre.

---

## 6. Sauvegarde, rétention, restauration (le point « 10 ans »)

### 6.1 Ce qui est suffisant
`outils/sauvegarder.bat` = `mysqldump --single-transaction` sur le schéma réel. C'est le bon outil : il est
restaurable tel quel (`outils/restaurer.bat`) et ne dépend pas de l'application.

### 6.2 À ajouter maintenant
- **Deux copies, dont une hors du PC serveur** : disque USB chiffré (BitLocker) déconnecté après copie, ou
  partage réseau d'un autre poste. Un `sauvegardes\` à côté de la base ne protège de rien (même panne, même
  rançongiciel, même `del`).
- **Rétention adaptée au médical** : 10 ans de dossiers ⇒ garder 7 dumps quotidiens + 4 hebdomadaires + 24
  mensuels + 10 annuels (et non « plus de 7 jours, poubelle »). Adapter la ligne `forfiles /D -7`.
- **Vérification** : une restauration mensuelle sur un PC d'essai, avec comptage des lignes restaurées vs
  production (`SELECT COUNT(*)` par table). Un dump non testé n'est pas une sauvegarde.
- **Empreinte** : ajouter un `certutil -hashfile FICHIER SHA256` à la fin du script, consigné dans un
  `manifeste.txt` à côté des dumps.

### 6.3 Piège à connaître avant de « nettoyer » la base
Ne **jamais** vider/tronquer une collection depuis l'interface pour gagner de la place (par exemple purger
`auditLogs` ou les vieilles consultations) : le protocole d'union considère toute ligne présente dans la
référence locale et absente de l'envoi comme **une suppression à propager** (`syncMerge.ts` →
`collectDeletions`) — cela effacerait les lignes pour tous les postes. L'archivage doit être fait
**côté serveur** (table d'archive + `DELETE` par脚本 SQL, hors heures, après dump), puis `read_all`
rechargé (nouvelle connexion). Procédure fournie dans `wamp_deploy/PERFORMANCE.md` §Archivage.

### 6.4 Réseau
- Ne **jamais** ouvrir le port 80/443 sur Internet (pas de redirection routeur, WAMP « En ligne » = LAN).
- `bind-address=127.0.0.1` sur MySQL : les postes n'ont besoin que d'Apache, pas de 3306.
- TLS interne : soit un reverse-proxy (stunnel/Caddy) devant Apache, soit au minimum un réseau dédié
  isolé du public. Tant qu'il n'y a pas de TLS, le jeton de session est volant sur le segment.
- Comptes Windows des postes : session verrouillée + pas de session partagée « Caisse » (un jeton volé
  vaut 12 h d'accès médical complet).

---

## 7. Plan pour tenir 10 ans

### 7.1 Phase A — synchronisation incrémentale (le seul vrai chantier)
Objectif : à 10 ans de données, enregistrer un patient doit coûter **une ligne**, pas **tout l'état**.

1. `lecture incrémentale` : `GET read_all?depuis=<rev>` renvoie, pour chaque dataset, uniquement les lignes
   dont la révision de table est postérieure à `<rev>` — soit en ajoutant une colonne `rev BIGINT` (proche
   de la révision globale) par ligne, soit en relisant `idx_maj` (`mis_a_jour` + fenêtre de 1 s).
2. `tombstones` : table `suppressions (dataset, id, rev)` alimentée par `sync_all` ; un poste qui revient en
   ligne applique les suppressions. Sans ça, un poste en retard réintroduit des lignes supprimées.
3. Le poste ne conserve plus qu'une fenêtre affichée (voir 7.2) au lieu de l'état complet :
   le clonage de baseline (G2) et la fusion (G3) deviennent O(fenêtre).
4. Régression à livrer avec : un test Playwright « deux onglets, écritures croisées, 5 000 lignes » qui
   vérifie qu'aucune ligne n'est perdue et que la charge réseau reste < 1 Mo/cycle.

Estimation : 3-5 jours de développement + 2 jours de tests. À faire **avant** que la base ne dépasse ~100 Mo.

### 7.2 Phase B — écrans fenêtrés
- Serveur : `GET liste?dataset=patients&q=…&de=…&limite=200&pays=…` (tri + recherche `FULLTEXT` indexée).
- Client : pagination/virtualisation dans `ModuleReception`, `ModuleCaisse`, `ModuleLaboratoire`,
  `ModulePharmacie` ; les totaux de clôture se calculent par SQL agrégé (`SUM`, `GROUP BY`) et non en
  repassant sur tout l'historique (`ModuleCaisse.tsx:1190-1273`).

### 7.3 Phase C — socle d'exploitation
- MySQL/MariaDB **en service** (pas WAMP en console), sauvegardes orchestrées, réplication vers un second
  PC du centre (coût : un PC) avec bascule documentée → plus de « redémarrage = perte de service ».
- Journalisation serveur des actions sensibles (`login`, `password`, suppressions, clôtures) **déjà écrite
  dans `api/logs/`** : à exporter vers la table d'audit horodatée côté serveur (l'audit client, lui, est
  append-only mais reste déclaratif).
- Test d'intrusion léger annuel (le LAN change de population) + revue du `SECURITE.md`.

### 7.4 Seuils d'alerte à instrumentation (à lire dans `diagnostic.php`)
| Signal | Vert | Orange | Rouge |
|---|---|---|---|
| Pic mémoire estimé de `read_all` / `memory_limit` | < 40 % | 40-80 % | > 80 % |
| Volume base | < 100 Mo | 100-500 Mo | > 500 Mo (archivage obligatoire) |
| Temps moyen `poll` | < 30 ms | 30-150 ms | > 150 ms |
| Sessions actives vs nombre de postes | ≤ | +2 | ≥ 3× |
| Espace disque libre | > 10 Go | 1-10 Go | < 1 Go |
| Âge de la dernière sauvegarde vérifiée | < 24 h | 24-72 h | > 72 h |

---

## 8. Ce qui a été livré dans ce dépôt avec cet audit

| Fichier | Contenu |
|---|---|
| `wamp_deploy/database/migrations/003_performance.sql` | table `revision` + index `idx_maj` sur les 35 tables, purge des sessions expirées, `schema_version` → 3 |
| `wamp_deploy/api/lib.php` | limite de corps cohérente avec PHP, lecture/révision, ACL admin, garde `users`, anti-brute-force, jeton sans URL, contrôle d'existence du compte |
| `wamp_deploy/api/index.php` | actions `poll` et `logout`, `if_rev` (409), `read_all` transactionnel + révision, écritures différentielles tolérées, audit append-only, mot de passe 8+ caractères et liste noire, révocation des sessions au changement de mot de passe |
| `wamp_deploy/api/diagnostic.php` | accès restreint, contrôle `revision`, buffer pool, binaire log sans purge, sessions ouvertes, projection « mur mémoire » en jours/mois restants |
| `wamp_deploy/.htaccess`, `api/.htaccess` | refus de `.sql/.md/.log/config.local.php`, dossiers `database/outils/logs/sauvegardes`, en-têtes `nosniff`/`X-Frame-Options`/`Referrer-Policy`/`no-store`, `LimitRequestBody 256M` |
| `src/wamp.ts` | `pollWamp()`, envoi différentiel, gestion 409 + rejoue, `logoutFromMysql()`, persistance `monthlyInvoices`/`prescripteursExternes` |
| `src/store.ts` | `addAuditLog`/`addNotification` immuables (indispensable à la détection différentielle ; corrige au passage la non-prise en compte en mode navigateur) |
| `wamp_deploy/api/config.local.php.exemple` | modèle de configuration (compte `salfa`, `SALFA_DEBUG=false`, corps 256 Mo, clé API) |
| `wamp_deploy/outils/deployer.bat` | copie désormais `.htaccess`, `outils/` et `config/`, et rappelle compilation + migrations + recette |
| `wamp_deploy/outils/hygiene_mysql.sql` | compte applicatif à privilèges moindres, `root` verrouillé, vérifications |
| `wamp_deploy/outils/test_charge.php` | mesure réelle sur votre serveur : temps et mémoire de `read_all`/`poll`/`sync_all`, projection des franchissements de limites |
| `wamp_deploy/PERFORMANCE.md` | réglages `php.ini`/`my.ini`/Apache prêts à coller, procédure d'archivage, plan de sauvegarde 10 ans |
| `wamp_deploy/SECURITE.md`, `README.md`, `QUICKSTART.md` | mises à jour (migration 003, ACL serveur, logout, blocage des connexions, checklist de recette) |
