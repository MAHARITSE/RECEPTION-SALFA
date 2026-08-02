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
   - Gestion des remises, acomptes et règlements multi-modes (Espèces, Chèque, Virement, Mobile Money).
   - Reçus et factures au format d'impression standard et tickets 80x80mm.
   - Clôture de caisse de garde avec récapitulatif comptable.

4. **🏢 Facturation Sociétés (Prise en charge & Crédits)**
   - Gestion des entreprises conventionnées (modes `global mensuel` et `individuel par facture`).
   - Suivi des relevés de factures et comptes clients.
   - Bouton de suppression et réinitialisation globale des données de facturation sociétés avec journalisation d'audit (`SUPPRESSION_TOTALE_FACTURATION_SOCIETES`).

5. **💊 Pharmacie & Délivrance**
   - Validation et délivrance des ordonnances médicales.
   - Gestion des stocks pharmacie et réapprovisionnements depuis le magasin central.

6. **📦 Magasinier & Stock Central**
   - Gestion du catalogue d'articles (Médicaments, Consommables labo/dentaire/écho).
   - Suivi des 3 tarifs (Achat, Comptoir, Société, Externe).
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

## 📂 Structure du projet — 2 parties distinctes

Le projet est divisé en **deux parties indépendantes**, chacune prête à déployer
dans son environnement :

```text
RECEPTION-SALFA/
├── workers/          #  PARTIE 1 — version JSON  → déployée sur workers.dev
├── WAMP/             #  PARTIE 2 — version WAMP locale (100 % MySQL)
├── src/              #  Source commune React/TypeScript (pour recompiler les 2)
└── docs/ …           #  Documentation & modèles de données
```

### 🟦 PARTIE 1 — `workers/` : version JSON (Cloudflare Workers)

Application **statique** en un seul fichier, données intégrées depuis
[`src/data/localData.json`](./src/data/localData.json) (état en mémoire).
À déployer sur **workers.dev** :

```bash
cd workers
npx wrangler login
npx wrangler deploy
```

➡️ Voir [`workers/README.md`](./workers/README.md) pour les détails.

### 🟨 PARTIE 2 — `WAMP/` : version WAMP locale (100 % MySQL)

Application compilée + API PHP + scripts SQL, à copier dans
`C:\wamp64\www\reception-salfa`. **Toutes les données sont stockées
strictement dans MySQL** dans des **tables normalisées en français** (`patients`,
`ventes`, `articles`, …). Cette partie a été reconstruite en
s'inspirant de [LogBara](https://github.com/MAHARITSE/LogBara) (connexion en
`127.0.0.1`, une table par entité, page de diagnostic MySQL) :

- L'application est chargée depuis MySQL au démarrage et sauvegarde
  automatiquement **chaque modification** (patients, consultations, caisse,
  ventes, stocks, messagerie, journal d'audit…) ;
- Connexion MySQL fiable en `127.0.0.1` (évite le bug IPv6 `::1` de WAMP) ;
- Page de vérification : `http://localhost/reception-salfa/api/diagnostic.php` ;
- Aucune donnée applicative dans `localStorage` ni dans un fichier JSON local.

➡️ Voir [`WAMP/README.md`](./WAMP/README.md) et [`WAMP/QUICKSTART.md`](./WAMP/QUICKSTART.md).

### 🔄 Recompiler les deux parties (depuis la source commune)

```bash
npm install
npm run build          # version JSON  → dist/index.html → copier vers workers/public/
npm run build:wamp     # version WAMP  → dist/index.html → copier vers WAMP/index.html
```

---

## 📚 Documentation & Modèles de Données

- [`CONSTITUTION_BASE_DONNEES.md`](./CONSTITUTION_BASE_DONNEES.md) : Dictionnaire complet des tables et helpers du store React.
- [`docs/SCHEMA_BASE_DONNEES.md`](./docs/SCHEMA_BASE_DONNEES.md) : Schéma relationnel et principes d'intégrité des données.
- [`prompt.md`](./prompt.md) : Prompt de référence décrivant les spécifications métier et les rôles utilisateurs.
