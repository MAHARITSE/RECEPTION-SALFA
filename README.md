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
- **Gestion d'état :** In-memory React state (`AppState`), initialisé depuis le fichier de données local [`src/data/localData.json`](./src/data/localData.json) (modifiable à la main)
- **Impression :** Support natif CSS Print & tickets de caisse 80x80

---

## 📚 Documentation & Modèles de Données

- [`CONSTITUTION_BASE_DONNEES.md`](./CONSTITUTION_BASE_DONNEES.md) : Dictionnaire complet des tables et helpers du store React.
- [`docs/SCHEMA_BASE_DONNEES.md`](./docs/SCHEMA_BASE_DONNEES.md) : Schéma relationnel et principes d'intégrité des données.
- [`prompt.md`](./prompt.md) : Prompt de référence décrivant les spécifications métier et les rôles utilisateurs.

---

## 💾 Exporter l'application ou déployer sur GitHub

Si vous souhaitez exporter le code ou l'envoyer vers GitHub depuis **AI Studio** :

1. **Exporter en fichier ZIP** :
   - Cliquez sur l'icône de **Paramètres / Menu (⚙️)** en haut à droite de l'interface AI Studio.
   - Sélectionnez l'option **Export** puis **Download ZIP**.

2. **Exporter / Synchroniser vers GitHub** :
   - Assurez-vous d'avoir autorisé et installé l'application **AI Studio GitHub App** sur votre compte GitHub.
   - Dans le menu **Settings / Export**, choisissez **Export to GitHub**.
   - Sélectionnez votre compte ou organisation et le nom du dépôt destination.
