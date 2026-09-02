# Analyse technique & améliorations — MediCare HIS (RECEPTION‑SALFA)

> Document d'analyse du code source réalisé le 2026‑09‑02, sur la branche `arena/01a060f0-reception-salfa`.
> Il décrit l'architecture, les points forts, les points de vigilance et les améliorations réellement apportées
> (interface + logique), avec des recommandations classées par priorité pour la suite.

---

## 1. Vue d'ensemble

**MediCare HIS** est un Système d'Information Hospitalier (HIS) monoligne **React 19 + TypeScript + Vite + Tailwind CSS v4**, couvrant toute la chaîne de soins et de facturation d'un centre de santé :

Réception → Médecin → Caisse / Facturation → Pharmacie / Magasin → Laboratoire → Dossiers médicaux → Messagerie & audit.

**Chiffres clés du dépôt :**

| Élément | Valeur |
|---|---|
| Code source React/TS (`src/`) | ~21 500 lignes, 41 fichiers (dont 14 modules/écrans) |
| Table unifiée des ventes (`ventes`/`venteLines`/`ventePayments`) | ~700 lignes de logique dans `store.ts` |
| Données de démonstration (`localData.json`) | ~602 Ko, 76 patients, 157 factures, 144 consultations, 37 demandes labo, 6 comptes sociétés |
| Build de production | OK — 1 287 Ko (302 Ko gzip), **monofichier** inliné |

Le projet cible **3 environnements de stockage** distincts pilotés par le même code :

1. **Cloudflare Workers** (`workers/`) — build statique, données en mémoire via le JSON de démo.
2. **WAMP / MySQL** — build `--mode wamp` (`VITE_WAMP_MODE=1`), **toutes** les données dans MySQL (aucun JSON intégré).
3. **Navigateur (IndexedDB)** — build standard : base locale du navigateur, sync entre onglets par fusion 3‑voies.

---

## 2. Architecture (forces)

### 2.1 Stockage & synchronisation bien conçus
- Un seul état applicatif `AppState` (store central) qui traverse tous les modules — modèle cohérent.
- **Fusion 3‑voies** (`syncMerge.ts`, `mergeStates`) + une seule synchro en vol à la fois (`syncInFlight`), pour éviter qu'un poste écarte le travail d'un autre. C'est l'une des parties les plus solides et les plus réfléchies du projet.
- Dernière écriture à la fermeture de l'onglet (`pagehide` / `beforeunload`).

### 2.2 Table unifiée des ventes
- Migration idempotente `migrateLegacyToVentes` depuis les anciennes `invoices` / `hbRecords` vers `ventes` + `venteLines` + `ventePayments`.
- `isPrescriptionPaid` / `paidPrescriptionsForConsultation` : règle de confidentialité unique — on ne montre **jamais** une ordonnance non réglée.

### 2.3 Robustesse
- **2 Error Boundaries** (global + périmètre de module) → pas d'écran blanc.
- `prepareLoadedState` garantit établissement principal, familles normalisées (migration `LAB → LABO`) et base unifiée LABO/ECHO/HOSP.
- Validation métier détaillée (constantes vitales, téléphone, n° dossier, blacklist…).
- Journal d'audit complet, notifications orientées par rôle, parcours patient (`journey`) en timeline.

### 2.4 Impressions
- Tickets de file d'attente, factures Salfa et tickets 80 mm via `printTicket.ts` / `printSalfaInvoice.ts`.

---

## 3. Points de vigilance / risques détectés

### 🔴 Sérieux
1. **Authentification factice.** `EcranConnexion.tsx` compare le mot de passe à `user.password` **en clair**, stocké dans le JSON / MySQL. Les mots de passe (`admin123`, `doc123`…) sont connus. → Il faut au minimum hasher (bcrypt côté PHP pour WAMP) et ne jamais exposer/transporter le mot de passe en clair.
2. **Fichiers de données volumineux et incohérents en démo** : `localData.json` (192 Ko) est la source, mais il coexiste avec `localData_clean.json` **et** `localData_fixed.json` (~524 Ko chacun) qui sont des copies de migration. Ils gonflent le dépôt et prêtent à confusion sur « quelle est la vraie base ? ». → Ne conserver qu'une seule source et archiver/versionner les autres.
3. **`select-none` global sur la Réception** : l'utilisateur ne peut pas sélectionner/copier un n° de dossier, un nom, etc. (pratique bancaire, discutable en réception).

### 🟠 Moyen (qualité/cohérence)
4. **Deux « mises en page » différentes** : la Réception a son **propre header/tableau** (historique, blocs `#[4a90d9]`, `#[4a6fa5]`, `#[e8e8e8]`, émojis `📊`) alors que les modules personnel passent par `MiseEnPage.tsx` (design moderne). Incohérence visuelle à l'ouverture de l'app. *(Corrigé en partie — voir §5.)*
5. **Mode sombre par surcharge CSS agressive** (`index.css`) qui écrase des classes génériques (`!important`) au lieu d'utiliser les variantes natives `dark:`. Fragile : toute nouvelle couleur hexadécimale échappe au mode sombre.
6. **Imports morts / code mort** repérés (ex. `Sun`, `Moon`, `useDarkMode`, et du code de « société » non branché dans `ModuleReception`). Non bloquant car `noUnusedLocals` est désactivé, mais à nettoyer.
7. **En-têtes/étiquettes par émojis** (`🩺`, `💳`…) mélangés aux icônes Lucide → rendu dépendant de la plateforme (Windows/Linux/Mobile diffèrent).
8. **Fichiers monolithiques énormes** : `ModuleCaisse` (2 261 l.), `ModuleFacturationSocietes` (2 137 l.), `ModuleMagasinier` (2 051 l.). Très difficile à maintenir/relire.

### 🟡 Accessibilité / conformité
9. `<html lang="en">` pour une application 100 % française *(corrigé)* ; boutons sans `aria-label` explicite, modales non gérées au clavier (`Esc`), peu de focus trap.
10. Nombres monétaires formatés avec des espaces insécables mais saisis/stockés en nombres — cohérent, à préserver.

---

## 4. Recommandations prioritaires (pour la suite)

| # | Action | Impact | Effort |
|---|---|---|---|
| 1 | Hacher les mots de passe (WAMP/PHP) et retirer ceux du client | 🔴 Sécurité | Moyen |
| 2 | Unifier l'UI sur un seul « shell » (faire passer Réception par `MiseEnPage` ou partager ses composants) | UI/UX | Moyen |
| 3 | Migrer le mode sombre vers des variantes `dark:` Tailwind et supprimer les surcharges `!important` | Maintenabilité | Moyen |
| 4 | Purger les données JSON dupliquées & découper les gros modules en sous‑composants | Qualité | Grand |
| 5 | Ajouter gestion `Esc`/focus sur les modales et `aria-label` systématiques | Accessibilité | Faible |
| 6 | Générer automatiquement le n° de dossier (auto‑incrément) tout en gardant la saisie manuelle | Ergonomie | Faible |

---

## 5. Améliorations apportées dans cette session

### 🎨 Interface — page d'accueil (Module Réception)
L'écran le plus daté a été modernisé **en conservant 100 % de la logique métier** (aucun handler modifié) et **compatible clair/sombre** (classes Tailwind standard) :

- **En‑tête refait** : dégradé bleu‑indigo cohérent avec le reste de l'app, libellé de rôle, badge « Réception & Accueil », horloge avec chiffres tabulaires et date en minuscules/capitalisée.
- **Barre d'outils refaite** : recherche avec bouton « effacer », boutons d'action (Nouveau / Modifier / Supprimer / Info / Bloqués) modernisés, `sticky` au défilement.
- **Tableau modernisé** : conteneur en carte arrondie, entête de tableau sombre propre, étiquettes lisibles (`Date naiss.`, `Âge`), bulle d'aide « double‑clic ».
- **Pied de page** épuré avec pastilles colorées et compteurs lisibles.
- Suppression des arrière‑plans hexadécimaux d'époque (`#e8e8e8`, `#f5f5f5`) non gérés par le mode sombre, remplacés par des classes `slate` (correctement adaptées en mode sombre).
- *(Un bandeau de 4 indicateurs avait été ajouté au cours de la session, puis **retiré à la demande** de l'utilisateur.)*

### 🧾 Facturation — passage à 2 onglets « Facture Client » / « Facture Société »
Le module Facturation (rôle Responsable facturation) est restructuré autour des **2 grandes familles de factures** du métier :

- **Facture Client (A5 individuel)** : chaque personne est facturée **individuellement**. Il regroupe désormais **TOUTES** les factures individuelles — **comptoir + externe + société** — dans **une liste unifiée**, avec une colonne *Type* (Comptoir / Société / Externe), le client + son éventuelle société, facturé / réglé / solde / statut, et les actions « Facture A5 » et « Régler » (si solde). Un sous‑filtre *Tous / Comptoir & salariés / Société / Externes* permet d'affiner. Un **salarié de société facturé en crédit société** apparaît ici (traité individuellement) pour qu'on puisse lui délivrer sa Facture A5.
- **Facture Société (regroupement mensuel)** : conserve toute la logique de regroupement **par société et par mois** (Global mensuel / Paiement individuel par salarié, impression Facture A4, règlements).
- L'**Historique & règlements antérieurs** reste accessible depuis Facture Société (« Voir Paiements Antérieurs ») et dispose d'un bouton « Retour aux factures ».

Règle de classement : une même facture **`clientType 'societe'`** (crédit société) est visible **à la fois** dans Facture Client (pour être traitée par personne, Facture A5) **et** dans le regroupement mensuel Facture Société. Les factures **`comptoir`** et **`externe`** figurent uniquement dans Facture Client.

### 🔬 Laboratoire — écran qui ne s'affichait pas (corrigé)
Au contrôle du module Laboratoire, **rien ne s'affichait**. Causes identifiées et corrigées :

1. **Bug de robustesse (cause principale)** : `ModuleLaboratoire.tsx` bouclait `c.labRequests.forEach(...)`
   sur **toutes** les consultations sans protection. Or de nombreuses consultations (anciennes du seed, mais aussi
   celles générées pour l'analyse) n'avaient **pas** de champ `labRequests` (`undefined`) → `TypeError` pendant le
   rendu → **écran blanc / module vide**, quel que soit le rôle. Corrections :
   - accès sécurisés `(c.labRequests || []).forEach/.map` dans l'agrégation, la mise à jour et la validation ;
   - normalisation globale au chargement (`ensureConsultationArrays` dans `prepareLoadedState`, `store.ts`) : chaque
     consultation se voit garantir ses tableaux `prescriptions`, `labRequests`, `echoRequests` — ce qui évite aussi
     des plantages latents dans le Dossier médical, la Caisse et la Pharmacie.
2. **Données de démo incomplètes** : les demandes de laboratoire générées étaient `completed` **sans `results`** et
   sans lien à leur facture, donc inexploitables. Le générateur produit désormais, pour chaque analyse, des
   **paramètres réels**, un **tableau `results`** (valeurs, normes, état Normal/Anormal, conclusion) et le lien à la
   facture payée (`invoiceId`) + l'intégration dans la consultation. Les 37 analyses s'affichent donc dans l'onglet
   **Résultats** du poste laboratoire et dans le dossier médical du médecin (10 comportent des anomalies à analyser).

### 💰 Caisse — médicaments « fantômes » dans la liste des prescriptions (corrigé)
En Caisse, la « Liste des prescriptions » ré-affichait des **médicaments déjà payés** (ex. « Paracétamol 500mg »,
« Vitamine C » à 0,00 Ar, en doublon — une fois par consultation) pour des patients dont la facture était pourtant
réglée. Cause : la Caisse considérait les médicaments comme non payés **uniquement** s'il existait une facture payée
avec `consultationId` **et** une ligne `category: 'pharmacy'`. Or de nombreuses consultations (anciennes du seed **et**
générées pour l'analyse) sont facturées par une facture « globale » **sans lien `consultationId`**, et leurs lignes
« Médicaments & Soins » n'avaient **pas de `category`** → la Caisse ne les reconnaissait pas comme réglées.

Corrections :
- **`store.ts`** (`normalizeInvoiceItemCategories`, appelé dans `prepareLoadedState`) : remplit la `category`
  manquante des lignes de facture d'après leur description (« Médicaments & Soins » → `pharmacy`, « Consultation
  Médicale » → `consultation`, etc.) — sans jamais écraser une catégorie déjà renseignée. Appliqué aussi aux données
  (`localData.json`) pour que le fichier soit cohérent.
- **`ModuleCaisse.tsx`** (`consultationPharmacyPaid`) : un médicament est considéré réglé s'il existe une facture payée
  « pharmacie » liée à la consultation, une vente payée « pharmacie » liée, ou (données legacy/démo sans `consultationId`)
  une facture **payée** du même patient, avec ligne pharmacie, datée du même jour que la consultation. Résultat : la
  Caisse n'affiche plus les médicaments déjà payés, et le montant « À encaisser » n'est plus pollué.

### 🩺 Dossier médical (vue médecin) — simplifié à « Chronologie » et « Analyses »
Le **dossier médical** vu par le médecin (`ModuleDossierMedical.tsx`) ne présentait que du clinique, mais avec 4 onglets.
À la demande, les onglets **Consultations** et **Factures** ont été **retirés** : la vue médecin conserve désormais
**2 onglets uniquement** :
- **Chronologie** : le parcours médical du patient (visites, consultations, prescriptions, analyses, hospitalisations)
  dans la timeline unifiée — toute l'information clinique (motif, diagnostic, prescriptions, examens) y est regroupée ;
- **Analyses** : résultats de laboratoire (valeurs, normes, état Normal/Anormal, compte-rendu imprimable).

La **Chronologie est 100 % clinique, sans volet financier** : aucune facture n'y est affichée (ni rattachée à une
visite via un badge « 💳 Facture », ni en événement « Facture directe » ; le filtre « Facturées » a été retiré). Sur
chaque **visite médicale**, le **détail de l'ordonnance** est affiché (médicament + quantité, posologie, durée,
instructions, état « délivré / à délivrer »), toujours visible pour le médecin/administrateur indépendamment du
règlement (le masquage des ordonnances non payées ne s'applique pas au dossier médical réservé aux médecins).

Aucune donnée financière n'est affichée dans ce parcours ; l'onglet reste réservé aux rôles `doctor` / `admin`.

La barre de filtres par type de la Chronologie (« Toutes / Urgences / Ordonnances / Examens ») a été remplacée par un
**filtre par intervalle de dates** (`Du … Au`, bornes incluses, avec bouton « Réinitialiser ») — plus pertinent pour un
historique clinique. Le compteur de la barre reflète le nombre d'événements affichés après le filtre.

### 🏥 Réception — nouveau patient (règles de saisie)
Dans le formulaire **« NOUVEAU PATIENT »** de la Réception (`ModuleReception.tsx`) :
- **Date de naissance obligatoire** (contrôle redondé : invalide / future / < 1900) ;
- **Adresse obligatoire** (avec message d'erreur sous le champ) ;
- **Prénom facultatif** (validé seulement s'il est renseigné) ;
- la **saisie libre « Société (libre) » est grisée** (`disabled`) : la société se choisit uniquement dans la
  liste déroulante « Société * » affichée quand le Type Client est « Client Société ».

### 🌍 Accessibilité / balisage (`index.html`)
- `<html lang="fr">` (l'app est en français), `lang` cohérent pour la synthèse/l'accessibilité.
- Ajout d'une `<meta name="description">` et d'une `meta theme-color`.

### ✅ Vérifications effectuées
- `npm run lint` (`tsc --noEmit`) : **aucune erreur**.
- `npm run build` : **succès** (monofichier généré).
- Serveur de dev actif sur le port 3000, HMR sans erreur.

---

## 5bis. Jeu de données d'analyse sur 3 mois (Juin–Août 2026)

À la demande (« ajouter des données de 3 mois pour faire un peu d'analyse »),
un jeu de **démo cohérent et complet sur 3 mois révolus** a été généré et injecté
dans `src/data/localData.json` par `generate_data_3mois.cjs` (script **idempotent** :
il repère et purge sa précédente génération grâce à un marqueur `_demo3m_ids`).

Contenu ajouté (lié et cohérent, montants réalistes, toutes les personnes reliées
à une société existante) :

| Juin 2026 | Juillet 2026 | Août 2026 | Total 3 mois |
|---|---|---|---|
| 30 factures / 1 745 000 Ar | 30 factures / 1 187 850 Ar | 30 factures / 1 514 800 Ar | 90 factures / ~4 447 650 Ar |

- +56 patients (comptoir + salariés conventionnés reliés aux 4 sociétés) → 76 au total ;
- +77 consultations, +231 événements de parcours patient ;
- +72 ventes (miroir unifié) et **6 comptes de facturation sociétés** (les mois soldés et les mois impayés),
  répartis sur les 4 entreprises : AIR MADAGASCAR 612 900 Ar · BNI MADAGASCAR 722 250 Ar ·
  JIRAMA 292 950 Ar · TELMA 323 550 Ar ;
- **+37 demandes d'analyses de laboratoire cohérentes** (rattachées à une consultation et à sa facture payée,
  dont 10 avec anomalies) : paramètres biologiques réels, valeurs mesurées, normes de référence, état
  Normal/Anormal et conclusion du biologiste → exploitables dans le module **Laboratoire** (onglet *Résultats*)
  et dans le dossier médical / l'espace Médecin.
- Le type de facture **comptoir / société / externe** est renseigné, ce qui alimente le sous-filtre
  *Tous / Comptoir & salariés / Société / Externes* de la **Facture Client** et les **regroupements mensuels**
  de la **Facture Société**.

**Pour régénérer** : `node generate_data_3mois.cjs` puis `npm run build`.
**Pour charger dans la version navigateur ouverte** : connexion Administrateur → **Réinitialisation TOTALE**
(le module re-charge le jeu de démo depuis `localData.json`). Choisir ensuite le mois dans les filtres Caisse/Facturation.

> ⚠️ Utiliser uniquement pour la démonstration/analyse — toutes les personnes et montants sont fictifs.

---

## 6. Pour bien tester visuellement
Le serveur de dev (`npm run dev`) est lancé et visible en **aperçu live**. Comptes de démo (RÉFÉRENCE — à ne pas laisser en prod) :
- Réception : page d'accueil (pas de login).
- Personnel : bouton **« Espace Personnel »** → sélection d'un utilisateur + mot de passe. Ex. Médecin `USR-DOC` / `doc123`, Caisse `USR-CASH` / `caisse123`, **Laboratoire `USR-LAB` / `labo123`**, Facturation `USR-BIL` / `fact123`.

**⚠️ Recharger les données modifiées** (la version navigateur stocke l'état dans **IndexedDB**) : après un changement de
`localData.json` ou de code, fermer/recharger l'onglet **puis**, côté Administrateur (`USR-ADMIN` / `admin123`),
faire une **Réinitialisation TOTALE de la Base de Données** (le module re-charge le jeu depuis `localData.json`).

**Tester le module Laboratoire** : connexion `USR-LAB` / `labo123` → le poste s'affiche (plus d'écran vide) et, dans
l'onglet **Résultats (37)**, on retrouve les analyses terminées avec leurs valeurs, normes et anomalies.

---

*Document de référence : ceci est une analyse interne d'aide au développement, complémentaire de `CONSTITUTION_BASE_DONNEES.md`, `docs/SCHEMA_BASE_DONNEES.md` et `prompt.md`.*
