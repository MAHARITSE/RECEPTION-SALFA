# 🔎 RAPPORT — VÉRIFICATION DE LA BASE LOCALE : LOGIQUE « ARTICLES UNIFIÉS »

> **Date :** 17 août 2026 · **Objet :** conformité de la base locale à la logique des articles unifiés (familles `LABO` et `ECHO`).

---

## 1. Règles de référence (logique attendue)

| Règle | Contenu |
|-------|---------|
| **Laboratoire (`LABO`)** | Tous les examens (NFS, Glycémie, Créatinine, CRP, Groupe Sanguin, ECBU, Goutte épaisse, TP/INR, bilans complets…) **et** les consommables sont intégrés dans la table unifiée des articles. |
| **Échographie (`ECHO`)** | Tous les actes (Abdominale, Pelvienne, Obstétricale, Cardiaque, Rénale, Thyroïdienne, Mammaire, Doppler, Prostatique…) **et** le gel d'échographie sont intégrés dans la même base d'articles. |
| **Modules synchronisés** | Magasinier, Laboratoire, Médecin, Caisse et Facturation exploitent ce référentiel unifié. |

---

## 2. Bases vérifiées

Deux bases locales sont présentes dans le dépôt :

| Base | Fichier | Verdict |
|------|---------|---------|
| Base navigateur (seed IndexedDB) | `src/data/localData.json` | ✅ **CONFORME** |
| Base MySQL (WAMP) | `WAMP/database/reception_salfa.sql` | ❌ **NON CONFORME** |

### 2.1 Base navigateur — `localData.json` ✅

Vérification automatisée : **0 problème** sur les 42 contrôles.

- 14 examens `LABO` présents dans `articles` avec code, catégorie, paramètres, type de prélèvement, tarif d'urgence et délai — **complets** ;
- 3 consommables `LABO` (Tube EDTA, Réactif Glycémie, Lames porte-objet) dans `articles` ;
- 10 actes `ECHO` + gel d'échographie dans `articles` ;
- Prix identiques entre le miroir legacy `labCatalog` et les articles (aucune divergence).

### 2.2 Base MySQL — `reception_salfa.sql` ❌

| # | Constat | Conséquence sur une base locale installée |
|---|---------|-------------------------------------------|
| 1 | **Aucun article seed** : la table `articles` démarre vide (le fichier ne contenait aucune `INSERT` d'articles). | Le Magasinier ne voit ni examens, ni actes, ni consommables LABO/ECHO. |
| 2 | L'état initial WAMP (`createEmptyInitialState`) part avec `articles: []` et `labCatalog: []`, écrits tels quels dans MySQL au premier démarrage. | La base locale reste définitivement hors logique unifiée. |
| 3 | Le catalogue labo ne vit que dans la table legacy `catalogue_laboratoire` (dataset `labCatalog`). | Deux sources concurrentes → divergences de prix et de référentiel. |
| 4 | **Aucune table ni seed écho** : les actes ECHO n'existent qu'en dur dans le code (`DEFAULT_ECHO_CATALOG`), pas dans la base. | Les actes écho ne sont pas gérables (stock, prix, familles) via le Magasinier. |
| 5 | Module **Laboratoire** non synchronisé : il lit `state.labCatalog` directement, contrairement à Médecin et Caisse qui passent par `getLabCatalog(articles, labCatalog)`. | Sur une base non migrée, le module Laboratoire affiche un catalogue vide. |

---

## 3. Corrections apportées

### 3.1 Code — synchronisation automatique de toute base locale

- **`src/store.ts`**
  - `labExamToArticle()` / `echoExamToArticle()` : conversion examen/acte → article unifié ;
  - `DEFAULT_LAB_CONSUMABLE_ARTICLES` / `DEFAULT_ECHO_GEL_ARTICLE` : consommables de référence ;
  - **`ensureUnifiedArticles(state)`** (idempotente) :
    - si aucun examen `LABO` dans `articles` → intégration des examens standards, des examens **personnalisés de l'ancien `labCatalog`** (migration legacy) et des consommables ;
    - si aucun acte `ECHO` → intégration des 10 actes + gel ;
    - le miroir legacy `labCatalog` suit les articles (articles = source de vérité : ajouts et suppressions répercutés) ;
    - **aucun article existant n'est modifié ni écrasé** ;
  - **`prepareLoadedState(state)`** : chaîne complète exécutée à chaque chargement d'une base locale (IndexedDB ou MySQL) — normalisation des familles, établissement principal, articles unifiés.
- **`src/App.tsx`** : les deux chemins de chargement (navigateur et WAMP) et l'écriture du seed initial passent par `prepareLoadedState`.
- **`src/components/ModuleLaboratoire.tsx`** : le module lit désormais le catalogue unifié `getLabCatalog(state.articles, state.labCatalog)` (sélection des examens, tarifs, totaux, contrôle de doublon) — même logique que Médecin et Caisse.

### 3.2 Base MySQL — référentiel unifié intégré

- **`WAMP/database/reception_salfa.sql`** : ajout du référentiel unifié (28 articles : 14 examens + 3 consommables `LABO`, 10 actes + gel `ECHO`) et du miroir `catalogue_laboratoire` (14 examens), en insertions **idempotentes** (`INSERT IGNORE` par identifiant).
- **`WAMP/database/migration_articles_unifies.sql`** *(nouveau)* : script à importer dans phpMyAdmin pour mettre une **base locale existante** en conformité sans toucher aux données métier.
- **`WAMP/deployment/install_wamp.bat`** : applique automatiquement la migration à l'installation.
- **`WAMP/index.html`** et **`workers/public/index.html`** : bundles reconstruits avec la correction.

### 3.3 Documentation

- `CONSTITUTION_BASE_DONNEES.md` : nouvelle section « Base unifiée des articles — familles LABO et ECHO ».
- `docs/SCHEMA_BASE_DONNEES.md` : description du seed unifié et de la migration.

---

## 4. Tests effectués

| Scénario | Résultat |
|----------|----------|
| Base vide (WAMP neuf) | ✅ 17 articles LABO (14 examens + 3 consommables) + 11 articles ECHO (10 actes + gel) intégrés, miroir = 14. |
| Base legacy (14 examens + 1 examen personnalisé dans `labCatalog`, articles vides) | ✅ 29 articles créés, examen personnalisé migré avec ses prix, miroir conservé (15). |
| Idempotence (2ᵉ passage) | ✅ Aucun changement (`changed = false`). |
| Base déjà unifiée (`localData.json`) | ✅ Aucune modification (39 articles inchangés). |
| Suppression d'un article d'examen | ✅ Non ré-injecté ; retiré aussi du miroir `labCatalog`. |
| Cohérence des prix miroir/articles | ✅ 0 divergence. |
| TypeScript (`tsc --noEmit`) | ✅ Aucune erreur. |
| Builds (`npm run build`, `npm run build:wamp`) | ✅ OK. |
| Syntaxe SQL des blocs de seed | ✅ Validée (parseur MySQL). |

---

## 5. Application sur votre base locale WAMP

1. **Sauvegardez** la base `reception_salfa` (Export phpMyAdmin).
2. Importez dans phpMyAdmin : `WAMP/database/migration_articles_unifies.sql`
   (ou relancez `WAMP/deployment/install_wamp.bat`).
3. Recopiez le nouveau `WAMP/index.html` (déjà reconstruit dans le dépôt).
4. Rouvrez l'application : au démarrage, `prepareLoadedState` réaligne automatiquement
   la base (examens personnalisés de l'ancien catalogue intégrés dans `articles`,
   miroir `catalogue_laboratoire` synchronisé). Les données métier (patients,
   ventes, factures) ne sont pas touchées.
