export const WINDEV_PROMPT = `# Prompt de l'application WinDev « RECEPTION SALFA »

> Crée une application de gestion hospitalière et pharmaceutique sous WinDev (PC SOFT), nommée **« RECEPTION SALFA »**, compilée en exécutable Windows 32 bits, avec une base de données **HFSQL** (Classic ou Client/Serveur). L'application gère l'accueil des patients, la caisse, la pharmacie et l'ensemble des services médicaux d'un centre de santé.

---

## 🎯 Objectif général

Application de gestion complète d'un établissement de santé (centre SALFA) :
réception des patients, facturation multi-services (médecine, bloc opératoire / dentisterie, hospitalisation, laboratoire d'analyses, imagerie/écho), gestion de caisse avec contrôles et clôtures journalières, gestion de stock pharmaceutique multi-entrepôts, achats fournisseurs, approvisionnement et statistiques.

---

## 🧩 Modules et fonctionnalités

### 1. Connexion & sécurité
- Fenêtre principale et menus (FEN_FENETRE_PRINCIPALE, FEN_MENU_1)
- Logins séparés par poste :
  - **Caisse & Pharmacie** (FEN_LOGIN_CAISSE_ET_PHARMECIE)
  - **Médecine** (FEN_LOGIN_MEDECINE)
- Fenêtre d'attente (FEN_Attente)
- Gestion des utilisateurs via la table \`Personnel\` (fonction, rôle)

### 2. Accueil / Réception des patients
- Tableaux de bord (FEN_ACCUEIL, FEN_ACCUEIL_MEDECINE)
- Saisie et fiche patient (FEN_SAISIE_PATIENT), numéro de dossier unique (\`Num_Dossier\`)
- File d'attente des patients (\`Fil_attente\`)
- Black liste (\`Black_Liste\`), sociétés partenaires (\`Société\`)
- Paramètres médicaux (constantes) avec historique (FEN_SAISIE_PARAMETRE, FEN_HISTORIQUE_PARAMETRE)

### 3. Caisse & Pharmacie (module principal — FEN_CAISSE_ET_PHARMACIE)
- Encaissement des factures, modes de règlement, **paiement partiel** (FEN_PAIEMENT_PARTIEL)
- Contrôle de caisse, **X de caisse**, vérification de caisse
- **Clôture de caisse** avec règle anti double-clôture (**1 seule clôture par jour**), clôtures séparées : standard, **bloc**, **hospitalisation**
- Impressions : reçu bloc, facture client, facture externe, facture comptable
- Historique des paiements, recette du jour

### 4. Médecine / Prescriptions
- Prescriptions du jour, ordonnances avec **posologie** (\`Ordonnance\`)
- Lignes de prescription (commande / ordonnance), diagnostics (\`Diagnostique\`)
- RMA (retours), analyses médicales (\`Analyse\`)

### 5. Bloc opératoire & Dentisterie (FEN_BLOC_ET_DENTISTERIE)
- Saisie bloc, recherche bloc, liste des clients bloc, contrôle de bloc, reçu bloc

### 6. Facturation
- Écrans de facturation (FEN_FACTURATION, FEN_AJOUT_FACTURATION, FEN_FACTURE, FEN_AFFICHAGE_FACTURE)
- Cycle de vie des factures : **en attente**, **clôturées**, **annulées**, **société** (numérotation dédiée), **externes**
- Lignes de facture (\`Ligne_Facture\`), facturation de fin de mois, SALFA fin de mois

### 7. Stock & Pharmacie
- Articles (familles d'articles, index full-text), stock (\`STOCK\`), ruptures, suivi, consultation
- Inventaires + lignes + saisie d'inventaire
- **Multi-entrepôts** : transferts d'articles entre entrepôts (+ lignes de transfert)
- Importation d'articles (FEN_Importation_Article)

### 8. Approvisionnement / Achats
- Fournisseurs, commandes (+ lignes), livraisons avec **validation** et attentes de livraison
- Achats (+ lignes d'achat), paiements d'achats, vérification des tarifs d'achat

### 9. Statistiques & états
- Recette du jour, consommation, statistiques, historique (global + lignes)
- ~90 états « Détails » et « Liste » par entité + états spécifiques : contrôle de caisse, X de caisse, facture client / société, reçu bloc, service labo, service écho, réception
- Écrans d'impression (FEN_Impression, FEN_Impression_Extene)

---

## 🗃️ Modèle de données (analyse WinDev — ~40 fichiers HFSQL)
- Patients: \`Patient\`, \`Paramètre\`, \`Black_Liste\`, \`Fil_attente\`, \`Société\`
- Personnel: \`Personnel\`
- Actes médicaux: \`Diagnostique\`, \`Analyse\`, \`Ordonnance\`, \`RMA\`
- Catalogue: \`Article\` ↔ \`Famille_Article\`
- Ventes / Facturation: \`Commande\` ↔ \`Ligne_commande\`, \`Facture_en_attente\`, \`FactureCloturé\`, \`FactureAnnuler\`, \`Facture_Société\` ↔ \`Ligne_Facture_Société\`, \`Ligne_Facture\`
- Achats: \`Achat\` ↔ \`Ligne_Achat\`, \`Fournisseur\`, \`Livraison\`, \`AttenteLivraison\`, \`Paiement_Achat\`
- Stock: \`STOCK\`, \`Entrepot\`, \`Inventaire\` ↔ \`Ligne_Inventaire\`, \`Rupture\`, \`Transfert\` ↔ \`Ligne_tranfert\`
- Caisse: \`Paiement\`, \`Mode_de_reglement\`
- Compteurs & Journal: \`NumArticle\`, \`NumCommande\`, \`Num_Facture_Société\`, \`NUM_FACTURE\`, \`SALFALOG\`

### Règles de gestion clés
- Chaque patient est identifié par un \`Num_Dossier\` unique
- **Une seule clôture de caisse par jour** (contrôle dédié)
- Fenêtres Fiche / Table / Vision générées par RAD WinDev

---

## ⚙️ Aspects techniques
- **Outil** : WinDev (projet « RECEPTION SALFA »)
- **Cible** : exécutable Windows 32 bits (\`RECEPTION SALFA.exe\`)
- **Base** : HFSQL Classic / Client-Serveur
- **Langue** : français (gabarits GenFlat / Material Design)
`;

export const WEB_PROMPT = `# Prompt Web — MediCare HIS / RECEPTION SALFA v3.0

> Application web de gestion hospitalière intégrée (HIS) construite avec React, Vite, Tailwind CSS, Lucide React, uuid. Monnaie : Ariary (Ar). Gère le parcours patient complet, 2 dépôts de stock (central + pharmacie), ventes directes, hospitalisations et bloc opératoire avec paiement partiel, messagerie interne, clôture de caisse avec ticket 80x80.

## Rôles & Connexion
- **Réception** : Sans connexion (accès libre), envoie des messages sous le nom "RECEPTION".
- **Médecin (DOC001-003)** : Consultations, prescriptions (recherche Sage ↑↓ Entrée), diagnostic obligatoire.
- **Caisse (CAS001)** : Facturation, vente externe, hospitalisation/bloc avec paiement partiel continu, clôture de caisse en 4 sections.
- **Pharmacie (PHA001)** : Délivrance sur ordonnance payée, stock pharmacie indépendant, demande réappro.
- **Magasinier (MAG001)** : Stock central, achats fournisseurs style Sage (N° BL, péremption), transferts vers pharmacie.
- **Laboratoire (LAB001)** : Saisie résultats analyses, normes automatiques, alertes hors normes.
- **Admin (ADM001)** : Gestion utilisateurs, articles, 3 tarifs (comptoir, société, externe), sociétés partenaires.
`;
