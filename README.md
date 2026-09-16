# RECEPTION SALFA — MediCare HIS (Système d'Information Hospitalier)

Application complète de gestion clinique et hospitalière (HIS — Hospital Information System) développée en **React 18**, **TypeScript**, **Vite** et **Tailwind CSS**.

---

## 🌟 Fonctionnalités & Modules

1. **🏥 Réception & Accueil Patient**
   - Inscription et création de dossiers patients (Numéro de dossier, matricule, famille/lien familial, constantes).
   - Envoi vers la file d'attente consultation ou examen.
   - Suppression sécurisée ou mise en liste noire (blacklist) des patients.

2. **🩺 Module Médecin & Consultation**
   - Prise de constantes vitales (Tension, Température, Pouls, SpO2, Poids, Taille, TDR).
   - Saisie du diagnostic, motif de visite et prescriptions médicales.
   - Demandes d'analyses de laboratoire et d'échographies.
   - Orientation vers l'hospitalisation ou le bloc opératoire.

3. **💰 Caisse & Facturation**
   - Émission des factures comptoir, sociétés et ventes externes.
   - **Numérotation officielle des factures** : `26FA0427102` = année (26) + diminutif facture (FA) + mois (04) + jour (27) + numéro d'ordre du jour (102). Pour les sociétés : `FA-07/BSA/26-014` = diminutif facture (FA) + mois des prescriptions (07) + code société ou diminutif enregistré automatiquement dans la société (BSA) + année (26) + ordre d'établissement dans le mois (014) — suite logique commune à toutes les sociétés (ex. le même mois : -013 JIRAMA, -014 BSA, -015 COPEFRITO).
   - Gestion des remises, acomptes et règlements multi-modes (Espèces, Chèque, Virement, Mobile Money).
   - Reçus et factures au format d'impression standard et tickets 80x80mm.
   - **Factures A5 (individuelle) et A4 (société)** : les colonnes **Qté, Prix et
     Montant ont exactement la même largeur que la case des totaux** (90 px en A5,
     18 % de la page en A4) — les « cages » de chiffres du tableau et du
     récapitulatif s'alignent verticalement. L'**en-tête par défaut** (identité
     SALFA, NIF, STAT, e-mail) est **identique sur les deux formats** ; il est
     remplacé par l'en-tête personnalisé dès qu'il est activé
     (Administration → En-tête Facture).
   - Clôture de caisse de garde avec récapitulatif comptable.

4. **🛡️ Suivi assurance — nouveau module**
   - Intégré depuis `MAHARITSE/suivi_assurance` : prestations, règlements, rejets, sociétés, assurés, actes et rapports.
   - Imports Excel/CSV ; **exports Excel/PDF/CSV téléchargés** par le poste (voir
     [doc exports et reliquats](docs/SUIVI_ASSURANCE.md)) ; sauvegarde `.sql` et saisie manuelle.
   - Facturation Sociétés (onglet Facturation) ; clients Comptoir & Externes regroupés dans l'onglet dédié « Comptoir & Externe » (leur règlement est encaissé à la validation Caisse, sans suivi) : vues mensuelle et détaillée distinctes, impression individuelle et numéro mensuel figé à la première impression. Émission atomique disponible en mode navigateur ; intégration serveur WAMP encore requise (voir [documentation](docs/SUIVI_ASSURANCE.md)).
   - Remplace les anciens écrans Facturation sociétés / Suivi assurance ; **la Caisse et l'historique sont conservés**.
   - Onglet **« Bloc & Hospit. — reliquats »** : patients sortis sur autorisation alors
     qu'il reste une somme due au centre — suivi, encaissement (écrit dans le dossier de
     caisse), relance imprimable et export Excel. Raccourci avec compteur depuis la Facturation.
   - Accès par le rôle **Responsable assurance** (identifiant technique `billing` conservé) ou le raccourci Administration.
   - Même base que Réception : sociétés, patients, familles et factures Caisse partagés. Les factures apparaissent automatiquement ; les règlements d’assurance mettent à jour leur suivi sans doubler les encaissements Caisse.
   - **WAMP : même API Réception ; mise à jour nécessaire pour les écritures assurance.** Voir [l'intégration et les limites de reprise](docs/SUIVI_ASSURANCE.md).

5. **💊 Pharmacie & Délivrance**
   - Validation et délivrance des ordonnances médicales.
   - Gestion des stocks pharmacie et réapprovisionnements depuis le magasin central.

6. **📦 Magasinier & Stock Central**
   - Gestion du catalogue d'articles (Médicaments, Consommables labo/dentaire/écho).
   - **Familles d'articles** : Médicaments, **Consultation**, Laboratoire,
     Échographie, Hospitalisation, Dentaire et **Autres**.
     **Seuls les Médicaments sont gérés en stock** (mouvements, alertes stock bas /
     rupture, contrôle de vente à la caisse) : les actes et services se vendent sans
     stock ni alerte. Une autre famille peut être activée à la main dans sa fiche
     (`Gestion du stock`), le réglage explicite restant prioritaire.
   - **Chaque article appartient à une famille** (famille obligatoire à la création,
     un article non classé est rattaché à « Autres »), **chaque article vendu porte la
     famille de son article** et **chaque vente est rattachée à une famille** : celle
     de ses lignes, sinon la famille dominante (montant, puis nombre de lignes, puis
     ordre du catalogue) pour une vente mixte. Les bases existantes sont complétées
     automatiquement au chargement (`normalizeVenteFamilies`), sans réécrire une
     famille déjà enregistrée.
   - 3 prix de vente par article (Comptoir, Société, Externe) + prix d'Achat.
   - Gestion des fournisseurs, réceptions de commandes (Style Sage Line) et transferts entre dépôts.

7. **🔬 Laboratoire**
   - Catalogue d'examens et réactifs.
   - Saisie et validation des résultats d'analyses d'urgence ou de routine.

8. **💬 Messagerie & Journal d'Audit**
   - Messagerie interne entre départements et utilisateurs.
   - Journal d'audit complet traçant les actions administratives et financières.

---

## 🛠️ Stack Technique

- **Frontend :** React 18, TypeScript, Vite, Tailwind CSS, Lucide React icons, Motion
- **Impression :** Support natif CSS Print & tickets de caisse 80x80

---

## 🎨 Thèmes clair et sombre

L'apparence reprend les thèmes du projet [MAHARITSE/Email](https://github.com/MAHARITSE/Email) :

| | Clair | Sombre |
|---|---|---|
| Fond principal | `#f8fafc` | `#05070a` |
| En-têtes et panneaux | `#ffffff` | `#080b10` |
| Texte principal | `#334155` | `#cbd5e1` |
| Accent | Cyan `#0891b2` | Cyan `#22d3ee` |

- Le bouton en bas à droite affiche uniquement l'icône de l'action : **soleil en mode sombre** pour passer au clair, **lune en mode clair** pour passer au sombre. Il est disponible sur la réception, la connexion et les modules métier.
- Le mode sombre est choisi par défaut, comme dans Email. Un choix déjà enregistré sous **`salfa_theme`** est conservé, indépendamment du thème du système.
- Le choix est synchronisé entre les onglets et appliqué avant le démarrage de React pour éviter un flash clair. Si le stockage est bloqué, la bascule fonctionne toujours pour la session courante.
- Les alertes médicales gardent leurs couleurs. Les aperçus de tickets restent blancs ; les styles sombres et le sélecteur ne sont pas imprimés.
- Cette préférence d'affichage ne modifie ni les données métier ni la session de connexion.

**Maintenance :** `src/context/ThemeContext.tsx` centralise l'état ; `src/index.css` définit la palette. Pour les nouveaux composants, utiliser les classes adaptatives `bg-canvas`, `bg-surface`, `bg-field`, `text-ink`, `text-ink-muted`, `border-line`, etc. Les variantes `dark:` sont pilotées par la classe du document, pas par le système d'exploitation. Éviter les surcharges globales `!important` sur les couleurs : elles cassent notamment les alertes, les survols et l'impression.

### Vérifier les thèmes

```bash
npm install
npx playwright install --with-deps chromium  # une seule fois
npm run lint
npm run test:theme                          # démarre Vite si nécessaire
npm run build
```

Les tests navigateur couvrent le premier affichage, la mémorisation, le clavier, le stockage indisponible, la synchronisation entre onglets, les formulaires, les tableaux, les rôles métier, la messagerie, l'impression et les écrans de 320 à 768 px. Chaque test utilise un navigateur isolé, sans toucher aux données d'un utilisateur existant.

> Le fichier de démonstration `src/data/localData.json` contenait des conflits de fusion bloquant la compilation. Ils ont été résolus en conservant la version amont complète de juin–août 2026, conforme au jeu décrit ci-dessous, sans régénération ni réinitialisation d'une base utilisateur.

---

## 🖨️ Reçus laboratoire et échographie

- À l'encaissement, le reçu de caisse, le bon laboratoire et le bon d'échographie sont imprimés **l'un après l'autre**. Validez ou fermez chaque fenêtre d'impression pour passer au document suivant. Les exemplaires configurés suivent la même file.
- Les bons reprennent les examens **facturés**, même lorsque leur demande ancienne n'a plus de lien direct avec la facture ou que l'examen est déjà terminé. Les autres examens du dossier ne sont pas ajoutés et l'avancement médical n'est pas rétrogradé.
- Pour récupérer un bon : **Caisse → Dernier encaissement — réimpression**, ou **Clôture → Reçus / Bons / Facture A5** pour les encaissements du jour affichés dans cette table. Les boutons **Bon laboratoire** et **Bon échographie** ne créent aucun nouveau paiement.
- Si le navigateur bloque le lancement, un avertissement reste visible dans l'application. Autorisez l'impression ; dans un aperçu intégré, utilisez **Ouvrir dans un nouvel onglet**, puis reconnectez-vous si nécessaire et réimprimez depuis la clôture. **N'encaissez pas une deuxième fois.**
- Le navigateur choisit l'imprimante et affiche sa boîte native. Une impression réellement silencieuse nécessite la configuration du poste (par exemple un navigateur en mode kiosk). L'application ne peut pas confirmer la sortie physique du papier.

**Maintenance :** `src/utils/printDocument.ts` centralise la file d'impression ; `src/utils/examReceipts.ts` reconstruit les lignes de bons sans modifier les données métier. Ne pas remettre de temporisations fixes entre documents ni supprimer un cadre tant que sa boîte d'impression est ouverte.

```bash
npm run test:printing  # Chromium / Playwright installé comme indiqué ci-dessus
```

Les tests utilisent des données et un navigateur isolés : encaissements patient et externe, laboratoire seul / écho seule, anciennes demandes, quantités, exemplaires, réimpressions, blocage navigateur et coexistence avec les factures SALFA A5. La boîte native est simulée : une vérification sur l'imprimante du poste reste nécessaire.

---

## 📂 Structure du projet — production WAMP + version navigateur

```text
RECEPTION-SALFA/
├── wamp_deploy/      #  PRODUCTION — version WAMP locale (100 % MySQL), prête à copier
├── src/              #  Source React/TypeScript (pour recompiler les 2 versions)
└── docs/ …           #  Documentation & modèles de données
```

> La version Cloudflare Workers a été supprimée : la production cible
> uniquement WAMP/MySQL en réseau local (données de santé : pas de cloud).

### 🟨 `wamp_deploy/` : version WAMP locale (100 % MySQL) — PRODUCTION

Application compilée (`index.html`) + API PHP + scripts SQL, à copier dans
`C:\wamp64\www\reception-salfa` (script `outils\deployer.bat` fourni).
**Toutes les données sont stockées strictement dans MySQL** dans des
**tables en français, une par entité** (`patients`, `ventes`, `articles`, …),
en s'inspirant de [LogBara](https://github.com/MAHARITSE/LogBara)
(connexion en `127.0.0.1`, une table par entité, page de diagnostic MySQL) :

- L'application est chargée depuis MySQL au démarrage et sauvegarde
  automatiquement **chaque modification** (patients, consultations, caisse,
  ventes, stocks, messagerie, journal d'audit…) ;
- API **transactionnelle** (`read_all` / `sync_all`), suppressions explicites
  uniquement, compteurs monotones, requêtes préparées partout ;
- Connexion MySQL fiable en `127.0.0.1` (évite le bug IPv6 `::1` de WAMP) ;
- Page de vérification : `http://localhost/reception-salfa/api/diagnostic.php`
  (santé PHP/MySQL, volumes, doublons n° facture / n° dossier) ;
- Scripts fournis : déploiement, **sauvegarde quotidienne** + rotation,
  restauration (avec confirmation) ;
- Bouton **Sauvegarder** dans l'application : télécharge un fichier `.sql`
  réimportable dans `reception_salfa` (mêmes tables, mêmes colonnes que le
  schéma) ; relance automatique de ce fichier à la déconnexion si la journée
  n'a rien exporté ;
- Aucune donnée applicative dans `localStorage` ni dans un fichier JSON local.

➡️ Voir [`wamp_deploy/README.md`](./wamp_deploy/README.md),
[`wamp_deploy/QUICKSTART.md`](./wamp_deploy/QUICKSTART.md) et
[`wamp_deploy/SECURITE.md`](./wamp_deploy/SECURITE.md) (à lire !).

### 🌐 Version navigateur (démo / hors WAMP)

La version standard (`npm run build` ou `npm run dev`) conserve les données de
l'application dans **IndexedDB**, la base locale du navigateur. Les données ne
sont pas envoyées à MySQL et restent dans le profil / navigateur utilisé. La
session de connexion n'est pas conservée : il faut se reconnecter après avoir
fermé l'application.

### ☁️ Hébergement statique du build navigateur (Cloudflare Pages, Netlify…)

Le build navigateur (`npm run build` → **`dist/index.html`**, fichier unique
auto-suffisant) peut être hébergé tel quel sur un hébergeur statique — par exemple
**Cloudflare Pages** : *Create a project → Direct Upload* (ou un dépôt avec la
commande de build `npm run build` et le dossier de sortie `dist`).

> ⚠️ **Ce qui est inclus dans ce fichier, et ce qui ne l'est pas.**
> `dist/index.html` embarque l'application **et les données par défaut**
> (`src/data/localData.json` : familles, articles, réglages d'impression, jeu de
> démonstration). En revanche, **tout ce qui est saisi dans l'application reste dans
> le navigateur de l'utilisateur** (IndexedDB) : l'**en-tête de facture personnalisé**
> (Administration → En-tête Facture), les logos, l'établissement, les sociétés, les
> patients… **ne font donc PAS partie du déploiement**.
>
> C'est la cause habituelle d'un écart d'**en-têtes** entre la version déployée et la
> version locale : la version déployée affiche l'**en-tête par défaut intégré**
> (identité SALFA / NIF / STAT / e-mail, identique en A5 et en A4, défini par
> `ETABLISSEMENT_SALFA` dans `src/utils/printSalfaInvoice.ts`) tant qu'aucun en-tête
> personnalisé n'a été enregistré **dans ce navigateur-là**.
>
> Pour obtenir exactement le même rendu partout :
> 1. soit enregistrer l'en-tête personnalisé sur chaque poste utilisé (il est
>    conservé dans le navigateur, et synchronisé dans MySQL en version WAMP) ;
> 2. soit modifier `ETABLISSEMENT_SALFA` / les réglages par défaut dans
>    `src/data/localData.json`, puis **recompiler** (`npm run build`) et
>    **redéployer** le nouveau `dist/index.html`.

### 🔄 Recompiler (depuis la source commune)

```bash
npm install
npm run build          # version navigateur (base locale IndexedDB) → dist/index.html
npm run build:wamp     # version WAMP (VITE_WAMP_MODE=1 via .env.wamp) → dist/index.html → copier vers wamp_deploy/index.html
```

---

## 🧪 Jeu de données de démonstration pour l'analyse (3 mois)

`src/data/localData.json` contient un jeu de **démo cohérent sur les 3 derniers
mois (17/06/2026 → 16/09/2026, fenêtre qui se termine aujourd'hui)** destiné à
l'analyse : patients comptoir + salariés conventionnés (liés à une société),
consultations, **factures individuelles (comptoir / société / externe)**, ventes
(miroir unifié), demandes de laboratoire, parcours patient, et **comptes de
facturation mensuels des sociétés** (mois soldés + mois impayés) pour alimenter le
module Facturation Société.

Le jeu respecte les règles métier en vigueur :

- **7 familles** (Médicaments, Consultation, Laboratoire, Échographie,
  Hospitalisation, Dentaire, Autres) et **seuls les articles Médicaments portent du
  stock** (stock pharmacie et dépôt central recalculés à partir des achats,
  transferts, délivrances et ventes de la fenêtre — aucune référence médicament à
  zéro, les actes et services sont à « Non géré ») ;
- **toutes les ventes et toutes les lignes vendues sont rattachées à une famille**
  (0 ligne sans famille) ;
- l'**établissement principal** et les **réglages d'impression** par défaut portent
  les mêmes mentions que les factures imprimées (NIF, téléphone, e-mail).

- **Régénérer** le jeu (idempotent, il nettoie sa précédente génération) :

  ```bash
  node scripts/regen_3mois.cjs      # → src/data/localData.json (version navigateur)
  node scripts/seed_sql_3mois.cjs   # → section « données de démonstration » du SQL WAMP
  npm run build                     # embarque les nouvelles données dans dist/index.html
  npm run build:wamp                # puis copier dist/index.html vers wamp_deploy/index.html
  ```

- **Charger ces données dans la version navigateur déjà ouverte** : connectez‑vous
  en **Administrateur** puis **Réinitialisation TOTALE de la Base de Données**
  (le module Administration recharge le jeu de démo depuis `localData.json`).
  Pour analyser, choisissez le mois voulu (Juin / Juillet / Août) dans les filtres
  des modules Caisse et Facturation.

> ⚠️ N'utilisez ce jeu que pour la **démonstration / l'analyse** : les montants,
> personnes et sociétés sont fictifs.

---

## 📚 Documentation & Modèles de Données

- [`CONSTITUTION_BASE_DONNEES.md`](./CONSTITUTION_BASE_DONNEES.md) : Dictionnaire complet des tables et helpers du store React.
- [`docs/SCHEMA_BASE_DONNEES.md`](./docs/SCHEMA_BASE_DONNEES.md) : Schéma relationnel et principes d'intégrité des données.
- [`prompt.md`](./prompt.md) : Prompt de référence décrivant les spécifications métier et les rôles utilisateurs.

## Mots de passe et gestionnaires du navigateur

Les champs de connexion, de création/modification de compte et de réinitialisation demandent `autocomplete="off"`. Des indications d’exclusion sont également fournies aux extensions de gestion de mots de passe. Le mot de passe de connexion saisi est vidé au changement de compte et après authentification ; le masquage natif et la validation avec Entrée sont conservés.

**Limite :** ces attributs sont des indications, pas une interdiction imposable par le site. Chrome, Edge, Firefox ou une extension peuvent les ignorer. Pour garantir l’absence de proposition d’enregistrement sur un poste, désactiver l’option de proposition d’enregistrement dans le gestionnaire de mots de passe du navigateur, ou choisir « Jamais pour ce site » si cette option est proposée. Les mots de passe déjà enregistrés doivent être retirés du gestionnaire par l’utilisateur ou l’administrateur du poste.

Ce réglage ne modifie pas les comptes ni leur stockage métier dans la base de l’application. Les tests vérifient les attributs rendus et les parcours de connexion/administration, pas les fenêtres natives du gestionnaire de mots de passe :

```bash
npx playwright test tests/credentials.spec.ts
```


### En-tête des factures et formats

**Administration → En-tête Facture** configure le texte et les images des factures, le choix de police et la taille de toute la zone d’en-tête (6–36 pt, boutons A− / A+). Cliquer sur **Enregistrer l’en-tête de facture** applique ces réglages aux impressions et réimpressions. Ils sont conservés dans la base commune et les sauvegardes.

- Facture société : **A4 portrait**.
- Facture individuelle : **A5 portrait**.
- Les tickets POS et la police du corps des factures ne sont pas modifiés.
- **L’en-tête ne coiffe que la première page.** Rien n’est étendu ni répété sur la
  deuxième page : une facture longue (individuelle A5, société A4, fusion) poursuit ses
  articles avec les seuls titres de colonnes ; le numéro de page imprimé suit la
  pagination réelle (`Page 2/3`).
- **Impression multiple « 2 par page A4 »** (fiche client Comptoir & Externe) : chaque
  facture porte **son propre en-tête**, cantonné à sa moitié de feuille A5 — deux
  en-têtes séparés par feuille, jamais un en-tête unique étendu sur la largeur.
- **Fusion de factures** : la facture imprimée porte le **numéro de la plus ancienne**
  des factures fusionnées, ses articles sont mis à la suite (aucune ligne d’origine
  n’est listée) et l’en-tête reste dans la première colonne, donc en première page.
