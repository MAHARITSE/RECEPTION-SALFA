# Audit Failles & Latences — RECEPTION-SALFA (MediCare HIS)
### Usage prévu : 100+ patients/jour pendant 10 ans

> Date : 14 septembre 2026 — Périmètre : code source du dépôt (`src/`, `docs/`, puis `wamp_deploy/`).
> Mise à jour du 14/09/2026 : le dossier **`wamp_deploy/`** (API PHP + schéma MySQL) a été créé (§S6 résolu) et `workers/` supprimé. Les risques restants sont suivis dans le plan d'action (§6).

---

## 1. Synthèse exécutive

| Axe | Verdict à 10 ans / 100 patients/jour |
|---|---|
| **Latences & volumétrie** | 🔴 **Bloquant** : l'architecture « 1 seul état global réécrit en entier à chaque modification » ne passe pas l'échelle. Ralentissements sensibles **dès la 1ʳᵉ année**, blocage probable **avant 3 ans**. |
| **Sécurité** | 🔴 **Critique** : mots de passe en clair, autorisations contournables en 2 minutes, données de santé non chiffrées. |
| **Durabilité des données** | 🔴 **Critique** : sauvegarde = export JSON manuel ; à ~1 Go, l'export/restauration via navigateur devient impossible. |
| **Fiabilité multi-postes** | 🟠 **Risque financier** : fusion « dernier écrivain gagne » par enregistrement → paiements concurrents perdables, numéros de facture duplicables. |
| **Maintenabilité 10 ans** | 🟡 Correct aujourd'hui (React 19, TS, tests Playwright), mais monolithes de 1 700–2 400 lignes et données démo embarquées dans le bundle. |

**Conclusion : le logiciel est sain pour une démo ou un petit volume (< 1 an à 100/jour), mais ne tiendra pas 10 ans sans refonte du stockage/synchronisation et durcissement sécurité. Le plan d'action priorisé est au §6.**

---

## 2. Projection de volumétrie (100 patients/jour × 365 j × 10 ans = 365 000 passages)

Tailles moyennes mesurées sur `src/data/localData.json` (4 Mo pour 3 mois de démo) :

| Collection | Volume à 10 ans (ordre de grandeur) | Poids JSON estimé |
|---|---|---|
| `patients` (dossiers, ~527 o) | ~200 000 dossiers | ~105 Mo |
| `consultations` (~1 683 o) | 365 000 | ~615 Mo |
| `invoices` (~846 o) | 365 000 | ~310 Mo |
| `ventes` + `venteLines` (miroir) | 365 000 + ~1,1 M lignes | ~575 Mo |
| `journey` (~355 o, ~4/passage) | ~1,5 M | ~520 Mo |
| `auditLogs` (~312 o) | ~700 000 | ~220 Mo |
| `labRequests`, `pharmaDeliveryItems`, `ventePayments`, `notifications`… | — | ~350 Mo |
| **Total** | | **≈ 2 à 2,7 Go de JSON** |

Même en divisant par 2 (jours fermés, patients revenants) : **~1 Go**. Tout ce qui suit découle de ce chiffre.

---

## 3. Failles de latence (par criticité)

### 🔴 L1 — Tout l'état est re-sérialisé et réécrit à chaque modification
- **Navigateur** (`App.tsx` + `browserDb.ts`) : après chaque modification (debounce 500 ms), `saveStateToBrowser()` fait `JSON.stringify` de **tout** l'état puis réécrit **1 seul record IndexedDB**. À 1 Go → **freeze de plusieurs secondes à chaque saisie**.
- **WAMP** (`wamp.ts` → `syncStateWithMysql`) : à chaque modification (debounce 800 ms) = `read_all` (télécharge TOUT) + fusion + `sync_all` (ré-envoie TOUT). Avec 3–5 postes, le réseau local et PHP sont saturés en permanence (payloads de dizaines/centaines de Mo, `max_allowed_packet`, `memory_limit`, timeouts).
- **Refresh permanent** : relecture + fusion complète toutes les **3 s** (inter-onglets) et **5 s** (WAMP), même sans activité.

### 🔴 L2 — La fusion et la comparaison coûtent O(n) stringify à chaque cycle
- `sameBusinessData()` (`syncMerge.ts`) : `JSON.stringify` de **chaque collection × 2** à chaque sync → secondes de freeze par cycle à fort volume.
- `mergeList()` : `JSON.stringify` **par enregistrement** pour détecter les modifs locales → des centaines de milliers de stringify à chaque sync à 10 ans.
- Ces fonctions tournent sur le thread UI : l'application se fige, les clics sont avalés.

### 🔴 L3 — Rendu sans pagination ni virtualisation
- **Réception** (`ModuleReception.tsx:598`) : `filteredPatients.map(...)` rend **toutes les lignes** du tableau (`<tr>` par dossier). Aucun `.slice`, aucune pagination. Quelques milliers de lignes DOM = déjà lent ; 200 000 = **navigateur mort**.
- Tri `.sort((a,b) => new Date(b.registeredAt) - ...)` + `new Date(...).toDateString()` **par patient à chaque render**, sans mémoïsation.
- `setState` au niveau `App` → **toute l'application re-rend à chaque frappe** (pas de contextes séparés, quasi aucun `React.memo`).
- `ModuleCaisse` (2 415 lignes) : dizaines de `.filter()` chaînés sur `invoices`/`consultations`/`patients` à chaque render, dont des `.filter().filter()` imbriqués (ex. lignes 1190–1273 : clôtures recalculées sur tout l'historique).

### 🔴 L4 — Numérotation des factures en O(n) + doublons multi-postes
- `collectExistingFactureNumbers()` + scan regex de **tous** les numéros à **chaque** encaissement (`factureNumber.ts`). À 365 000 factures, chaque validation scanne tout.
- **Doublon possible** : 2 caisses attribuent le même numéro avant la prochaine sync (compteur = max()+1 non atomique, aucune contrainte d'unicité vérifiable côté serveur — dossier `WAMP/` absent).

### 🟠 L5 — Recherche plein-texte sans index
- `correspondRechercheMultiMots` scanne tous les patients à chaque frappe. OK à 135 patients, lent à 50 000+, impraticable à 200 000.

### 🟠 L6 — Démarrage de plus en plus lent
- `migrateLegacyToVentes`, `normalizeFamilyBases` (avec `JSON.stringify` comparatifs), `ensureUnifiedArticles`, `prepareLoadedState` rejouent des passes O(n) à chaque chargement.

### 🟡 Seuils estimés (à 100 patients/jour)

| Horizon | Volume approx. | Symptômes attendus |
|---|---|---|
| **3–6 mois** | ~10–20 000 dossiers | Tableau réception lent, recherches qui accrochent |
| **~1 an** | ~35 000 passages (~100 Mo) | Sauvegardes > 1 s, syncs pénibles, export JSON lourd |
| **~3 ans** | ~100 000 passages (~500 Mo–1 Go) | Freezes multi-secondes réguliers, timeouts PHP/MySQL, export impossible |
| **10 ans** | 365 000 passages (~2 Go) | **Inutilisable en l'état** (mémoire onglet, IndexedDB, DOM) |

---

## 4. Failles de sécurité et de fiabilité

### 🔴 S1 — Mots de passe en clair, partout
- `User.password` stocké **en clair** (`types.ts:9`), comparé par `user.password !== password` (`EcranConnexion.tsx:60`).
- Les mots de passe (`admin123`, `doc123`, `caisse123`…) sont **versionnés dans git** (`localData.json`), **affichés sur l'écran de connexion**, persistés dans IndexedDB/MySQL et inclus dans les **exports JSON**.
- Pas de hash (bcrypt/argon2), pas de politique de complexité, pas d'expiration, pas de verrouillage après échecs (brute-force trivial, hors-ligne).
- Sur 10 ans (turnover du personnel) : comptes fantômes, aucun moyen d'auditer « qui savait quel mot de passe ».

### 🔴 S2 — Autorisations purement décoratives
- Le rôle affiché dépend de `state.currentUser.role`, modifiable depuis les **données locales** : un utilisateur peut ajouter `'admin'` à son `roles` via DevTools → IndexedDB → recharger, et obtenir la console d'administration. Aucune vérification côté serveur (l'API WAMP `read_all`/`sync_all` ne montre aucun mécanisme d'authentification dans le code client).
- Conséquence : un caissier/pharmacien un peu débrouillard peut lire les dossiers médicaux, purger l'audit, réinitialiser la base.

### 🔴 S3 — Données de santé sensibles non protégées
- Diagnostics, sérologies (VIH…), ordonnances : stockées **en clair**, exportées en clair, journal d'audit dans le même état (modifiable/purgeable par un admin → **non-répudiation faible**).
- Pas de chiffrement au repos, pas de séparation des accès par sensibilité (un rôle `billing` peut techniquement tout lire dans le state).
- La mention « Conforme RGPD » sur l'écran de connexion est **contredite** par l'architecture (pas de minimisation d'accès, pas de chiffrement, pas de droit à l'effacement outillé).

### 🔴 S4 — Perte de données : 1 fausse manip ou 1 disque mort
- **Mode navigateur** : données liées à **1 profil navigateur sur 1 poste**. Vol/panne disque/profil corrompu = perte totale si l'export manuel n'a pas été fait.
- **IndexedDB = 1 seul record `state`** : pas de requêtes, pas de réparation partielle. Corruption d'un record = tout ou rien.
- **« Réinitialisation TOTALE »** (`ModuleAdministration.tsx`) : 1 confirmation modale puis **écrasement immédiat**, sans sauvegarde automatique préalable, sans saisie de confirmation (« tapez SUPPRIMER »), sans double validation. En mode standard elle **remplace la prod par le jeu de démo**. Sur 10 ans d'exploitation, c'est l'accident qui arrivera.
- `localStorage.clear()` appelé dans le reset, puis `sendBeacon` de fermeture (`flushStateToMysql`) **sans fusion** : un onglet fermé peut **écraser** le travail des autres postes (écriture brute de son état périmé). `sendBeacon` ne garantit ni l'ordre ni la livraison.

### 🟠 S5 — Conflits multi-postes = risque financier
- Fusion « l'enregistrement local gagne s'il diffère de la base » (`syncMerge.ts`) : 2 caisses encaissant/modifiant **la même vente** → **un paiement est silencieusement perdu** (pas de merge au niveau ligne/paiement, pas de transaction ACID : vente + lignes + paiement + stock écrits en datasets séparés, non atomiques).
- Stock décrémenté côté client avec `Math.max(0, …)` : 2 ventes concurrentes du dernier article → **oversell**, inventaires faux.
- `dossierCounter` en mémoire (`store.ts:16`, reset à 100 à chaque rechargement) : Doublons de n° de dossier probables ; `isDossierTaken` ne protège pas des races inter-postes.
- Horloges postes non synchronisées (`new Date()` partout) : ordre des clôtures et dates de factures faussables.

### 🟠 S6 — Dossier `WAMP/` absent du dépôt
- Le README décrit `WAMP/` (API PHP, SQL, diagnostic), mais il **n'existe pas** dans le dépôt. Impossible de vérifier : requêtes préparées (injections SQL ?), index, contraintes d'unicité, migrations de schéma, sauvegardes MySQL, authentification API. **C'est le point aveugle n°1 de cet audit.**

### 🟢 Points positifs vérifiés (à préserver)
- Échappement HTML systématique dans les impressions (`escapeHtml` dans `printTicket.ts`/`printSalfaInvoice.ts`) ; en-tête facture HTML assaini via **DOMPurify** (`invoiceHeader.ts`) → risque XSS maîtrisé sur ces chemins.
- Règle `isPrescriptionPaid` : ordonnance jamais affichée avant paiement.
- Error Boundaries global + module (pas d'écran blanc), journal d'audit, fusion 3-voies (bonne idée, mauvaise échelle).

---

## 5. Risques d'exploitation sur 10 ans

| # | Risque | Détail |
|---|---|---|
| E1 | **Croissance infinie sans purge** | `notifications`, `journey`, `auditLogs`, `messages` : `.unshift` sans limite, jamais purgés ni archivés. `notifications` affichées à chaque login. |
| E2 | **Données démo dans le bundle** | `import localSeedData from './data/localData.json'` (4,9 Mo) embarqué dans le JS + `workers/public/index.html` de **7,1 Mo** → chargement lent, confusion démo/prod. |
| E3 | **Fichiers parasites** | `localData_clean.json`, `localData_fixed.json`, `fix_json*.cjs`, `generate_*.cjs`, `update_caisse.cjs` à la racine : « quelle est la vraie base ? » |
| E4 | **Impression non garantie** | Encaissement enregistré, mais si coupure courant avant/pendant `print()` → ticket perdu ; pas de spool persistant ni de réimpression systématique proposée. |
| E5 | **Dépendances** | Stack saine (React 19, Vite 7, Tailwind v4) mais **aucune mise à jour planifiée** : sur 10 ans, failles CVE non patchées, incompatibilités navigateur. Pas de CI, pas de `npm audit` documenté. |
| E6 | **Monolithes** | `ModuleCaisse` 2 415 l., `ModuleMagasinier` 2 053 l., `ModuleMedecin` 1 712 l. : maintenance/relecture très coûteuse, risque de régression à chaque correctif. |
| E7 | **Tests** | Playwright couvre thèmes/impression/facturation, mais **aucun test de charge ni de volumétrie** (10k/100k enregistrements), aucun test de la fusion concurrente. |

---

## 6. Plan d'action priorisé

### Phase 0 — Immédiat (avant montée en charge, effort faible)
1. **Changer tous les mots de passe par défaut** et **retirer leur affichage** de l'écran de connexion + du dépôt (purger `localData.json` ou le déplacer hors prod).
2. **Durcir la réinitialisation** : sauvegarde auto préalable + saisie de confirmation + rôle admin réel requis. Jamais de retour au jeu démo en production.
3. **Paginer le tableau Réception** (50–100 lignes/page) + limiter les suggestions (`slice`) : gain immédiat, ~1 jour de travail.
4. **Purger/archiver** : tâche admin « archiver les notifications lues > 30 j, journey > 2 ans » ; arrêter la croissance infinie.
5. **Exclure les JSON de démo du bundle prod** (build WAMP déjà vide : généraliser ; ne plus `import` 5 Mo de seed).
6. **Versionner `WAMP/`** (API + SQL) ou le reconstruire : sans lui, aucun audit serveur n'est possible.

### Phase 1 — Court terme (1–3 mois, indispensable avant ~1 an d'usage)
7. **Authentification réelle** : hash bcrypt côté PHP, sessions/token API, mots de passe jamais renvoyés au client ; verrouillage après N échecs ; comptes désactivables.
8. **Autorisation serveur** : l'API refuse les lectures/écritures hors rôle (un caissier ne reçoit jamais les diagnostics) ; rôles non modifiables côté client.
9. **API incrémentale** : remplacer `read_all`/`sync_all` par des endpoints paginés + **delta** (seulement ce qui change : `updatedAt` + sync token). C'est LE correctif anti-latence.
10. **Contraintes d'unicité** : n° facture (clé unique MySQL + séquence transactionnelle), n° dossier (compteur serveur atomique) → finit les doublons.
11. **Transactions** : encaissement (vente + lignes + paiement + stock + clôture) en **1 transaction ACID** → finit les paiements perdus.
12. **Sauvegardes automatiques** : `mysqldump` planifié + rotation + **test de restauration mensuel** documenté ; exports chiffrés.

### Phase 2 — Moyen terme (3–12 mois, pour tenir 10 ans)
13. **Refonte du state client** : requêtes paginées (jamais tout en mémoire), virtualisation des grandes listes (`react-virtuoso`/`tanstack-virtual`), index de recherche (recherche serveur `LIKE`/FULLTEXT).
14. **Archivage froid** : exercices clôturés déplacés vers tables d'archive (consultation seule), base chaude < 2 ans.
15. **Chiffrement** : disque chiffré (minimum), TLS local, exports chiffrés ; journal d'audit append-only.
16. **Observabilité** : logs serveur, métriques (temps de sync, taille base), alertes quota disque, page de diagnostic enrichie.
17. **Découpage des monolithes** + CI (`tsc`, tests, `npm audit`, build) + politique de mises à jour trimestrielle.

### Phase 3 — Gouvernance 10 ans
18. Revue sécurité annuelle, exercice de restauration annuel, documentation d'exploitation (procédures panne/coupure), contrat de maintenance pour les montées de version React/Vite/MySQL/PHP.

---

## 7. Fichiers audités (extraits clés)

| Fichier | Constat |
|---|---|
| `src/App.tsx` | 1 state global, save+sync complets à chaque change, refresh 3–5 s |
| `src/store.ts` (1 689 l.) | `dossierCounter` mémoire, `mergeLegacyToVentes`, helpers O(n) |
| `src/browserDb.ts` | 1 record IndexedDB `state`, réécrit en entier (debounce 500 ms) |
| `src/wamp.ts` | `read_all`+`sync_all` complets à chaque change ; `sendBeacon` brut à la fermeture |
| `src/syncMerge.ts` | `JSON.stringify` par collection et par enregistrement à chaque sync |
| `src/components/EcranConnexion.tsx:60` | comparaison mot de passe en clair + mdp affichés à l'écran |
| `src/components/ModuleReception.tsx:598` | rendu de toutes les lignes patients, sans pagination |
| `src/components/ModuleCaisse.tsx` (2 415 l.) | filtres O(n) chaînés à chaque render |
| `src/components/ModuleAdministration.tsx` | reset total sans backup auto ; export JSON manuel |
| `src/utils/factureNumber.ts` | numérotation max()+1 non atomique |
| `src/utils/printTicket.ts`, `printSalfaInvoice.ts`, `invoiceHeader.ts` | ✅ échappement + DOMPurify corrects |
| `workers/public/index.html` (7,1 Mo) | bundle incluant la démo |
| `WAMP/` | ❌ absent du dépôt |

---

*État au 14/09/2026 : (1) ✅ `wamp_deploy/` créé et versionné (PHP/SQL auditables) ; (2) appliquer la Phase 0 restante (mots de passe, pagination Réception, reset durci, purge) ; (3) cadrer la Phase 1 (API incrémentale + auth réelle).*
