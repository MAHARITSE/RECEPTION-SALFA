# Analyse et Intégration du Prompt WinDev « RECEPTION SALFA » dans l'Application Web

Ce document présente l'analyse détaillée du prompt de l'application WinDev **« RECEPTION SALFA »** (développée initialement sous PC SOFT WinDev avec base de données HFSQL) et démontre son intégration complète et sa transposition dans notre application web moderne (**React 19 + TypeScript + Vite + Tailwind CSS 4**).

---

## 1. Tableau de Correspondance : Architecture WinDev (HFSQL) vs Application Web (React / TypeScript)

| Domaine / Module WinDev | Fichiers / Fenêtres WinDev (`FEN_...`) | Implémentation dans l'Application Web |
|---|---|---|
| **1. Connexion & Sécurité** | `FEN_FENETRE_PRINCIPALE`, `FEN_MENU_1`, `FEN_LOGIN_CAISSE_ET_PHARMACIE`, `FEN_LOGIN_MEDECINE`, `FEN_Attente`, `Personnel` | `LoginScreen.tsx`, `Layout.tsx`, authentification par rôle (`UserRole`), gestion des utilisateurs (`AdminModule`), journalisation des actions (`auditLogs`). |
| **2. Accueil & Réception** | `FEN_ACCUEIL`, `FEN_ACCUEIL_MEDECINE`, `FEN_SAISIE_PATIENT`, `Num_Dossier`, `Fil_attente`, `Black_Liste`, `Société`, `FEN_SAISIE_PARAMETRE`, `FEN_HISTORIQUE_PARAMETRE` | `ReceptionModule.tsx`, génération automatique du numéro de dossier unique (`Num_Dossier`), gestion des constantes vitales, gestion des types de clients (Comptoir / Société / Externe), liste d'attente médecin. |
| **3. Caisse & Pharmacie** | `FEN_CAISSE_ET_PHARMACIE`, `FEN_PAIEMENT_PARTIEL`, X de caisse, Contrôle de caisse, Clôture de caisse (1 seule par jour), reçus | `CashierModule.tsx`, 5 onglets dédiés (Facturation, Vente Externe, Hospitalisation, Bloc Opératoire, Clôture de Caisse), impression ticket thermique 80x80. |
| **4. Médecine & Prescriptions** | `Ordonnance`, `Diagnostique`, `Analyse`, `RMA`, posologie | `DoctorModule.tsx`, saisie des consultations (diagnostic obligatoire, motif optionnel), prescriptions avec recherche rapide type Sage (clavier ↑↓ Entrée), gestion des remises par ligne. |
| **5. Bloc & Dentisterie** | `FEN_BLOC_ET_DENTISTERIE`, saisie bloc, recherche, reçu | Intégré dans `CashierModule.tsx` (onglets Hospitalisation & Bloc avec saisie article par article et versements partiels). |
| **6. Facturation** | `FEN_FACTURATION`, `FEN_AJOUT_FACTURATION`, `FEN_FACTURE`, `FEN_AFFICHAGE_FACTURE`, `Facture_en_attente`, `FactureCloturé`, `FactureAnnuler`, `Facture_Société` | Gestion des factures, cycle de vie (en attente, payées, externes, société), ventilation par catégorie. |
| **7. Stock & Pharmacie** | `Article`, `Famille_Article`, `STOCK`, `Entrepot`, `Inventaire`, `Rupture`, `Transfert`, `FEN_Importation_Article` | `PharmacyModule.tsx` et `MagasinierModule.tsx` : Double entrepôt indépendant (Stock Central pour le magasinier, Stock Pharmacie pour le pharmacien), transferts inter-entrepôts, alertes de rupture, gestion des dates de péremption. |
| **8. Approvisionnement / Achats** | `Achat`, `Ligne_Achat`, `Fournisseur`, `Livraison`, `AttenteLivraison`, `Paiement_Achat` | `MagasinierModule.tsx` (onglet Entrées / Achats style Sage avec N° de BL, fournisseur et péremption). |
| **9. Statistiques & États** | `FEN_Impression`, `FEN_Impression_Extene`, états « Détails », « Liste », X de caisse, contrôle de caisse | Tableaux de bord financiers, récapitulatifs de caisse, reçus imprimables, journaux d'audit. |

---

## 2. Analyse des Règles de Gestion Clés

### A. Identification Unique des Patients (`Num_Dossier`)
- **WinDev (HFSQL)** : Chaque patient possède un `Num_Dossier` unique généré via un compteur séquentiel ou une règle de hachage des initiales (ex: `MAR101`).
- **Application Web** : Implémenté via la fonction `generateDossierNumber(lastName)` dans `store.ts`, garantissant l'unicité et le formatage normalisé.

### B. Gestion de Caisse & Clôture Journalière
- **WinDev (HFSQL)** : Règle anti-double-clôture stricte (1 seule clôture par jour), avec séparation standard, bloc et hospitalisation. X de caisse et contrôle de caisse.
- **Application Web** : Le module `CashierModule` intègre l'onglet **Clôture de Caisse** structuré en 4 parties :
  1. Totaux par famille (Consultations, Ventes Externe, Hospit/Bloc).
  2. Ventilation Hospitalisation & Bloc (Facturé, Reçu, Reste à payer, Caissier).
  3. Total général des versements.
  4. Journal chronologique détaillé de tous les règlements de la journée.

### C. Double Entrepôt & Logistique Pharmaceutique
- **WinDev (HFSQL)** : Tables `STOCK`, `Entrepot`, `Transfert`, `Rupture`.
- **Application Web** : Séparation rigoureuse entre le **Stock Central** (sous la responsabilité du Magasinier qui gère les achats fournisseurs et les transferts) et le **Stock Pharmacie** (géré par le pharmacien pour la dispensation directe aux patients).

### D. Interface de Saisie Ergonomique (« Style Sage »)
- **WinDev (HFSQL)** : Saisie assistée (`ClSaisieAssistee`) et fenêtres RAD.
- **Application Web** : Saisie rapide par un champ unique avec recherche instantanée dans toutes les familles (`MEDIC`, `LABO`, `DENT`, `ECHO`), navigation au clavier (`↑`, `↓`, `Entrée`, `Échap`), affichage du prix d'achat, des prix de vente différenciés (Comptoir, Société, Externe) et gestion des remises par ligne.

---

## 3. Synthèse de l'Intégration

L'analyse de l'application WinDev « RECEPTION SALFA » montre que l'application web actuelle (**MediCare HIS / RECEPTION SALFA**) transpose fidèlement et modernise l'ensemble des modules métiers, des flux de données, des règles de sécurité et des contraintes hospitalières du projet WinDev d'origine dans un environnement web hautement réactif, multi-utilisateurs et accessible sans installation locale lourde.
