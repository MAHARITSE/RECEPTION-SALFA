# PROMPT COMPLET — MediCare HIS v4.0

---

## RÔLE ET CONTEXTE

Application web de gestion hospitalière intégrée (HIS) construite avec **React, Vite, Tailwind CSS, Lucide React, uuid**. Monnaie : **Ariary (Ar)**. Gère le parcours patient complet, 2 dépôts de stock (central + pharmacie), ventes directes, hospitalisations et bloc opératoire avec paiement partiel, messagerie interne, clôture de caisse avec ticket 80x80.

---

## PARTIE 1 : UTILISATEURS ET CONNEXION

### Réception : SANS connexion (accès libre)
- Envoie des messages sous le nom **"RECEPTION"**
- Visible par tous les staff dans la messagerie

### Staff : AVEC connexion (identifiant + mot de passe)

| Rôle | ID par défaut | MDP | Modules |
|------|--------------|-----|---------|
| Médecin | DOC001/002/003 | doc123 | Consultation, prescription, suivi du jour |
| Caisse | CAS001 | caisse123 | Facturation, vente externe, hospit/bloc, clôture |
| Pharmacie | PHA001 | pharma123 | Délivrance, stock pharmacie, demande réappro |
| Magasinier | MAG001 | mag123 | Stock central, achats (style Sage), transferts |
| Laboratoire | LAB001 | labo123 | Analyses, résultats, normes |
| Hospitalisation | HOS001 | hosp123 | Gestion séjours, lits |
| Admin | ADM001 | admin123 | Utilisateurs, articles, tarifs, sociétés |

---

## PARTIE 2 : ARTICLES ET TARIFICATION

### 4 Familles d'articles

| Code | Famille | Exemples |
|------|---------|----------|
| MEDIC | Médicaments | Paracétamol, Amoxicilline, Insuline |
| LABO | Réactifs Labo | Tubes EDTA, Réactifs, Bandelettes |
| DENT | Dentaire | Composite, Anesthésique dentaire |
| ECHO | Échographie | Gel écho, Papier thermique |

### 3 Tarifs par article + prix d'achat

| Champ | Description |
|-------|-------------|
| Prix Achat | Coût d'achat fournisseur |
| Prix Comptoir | Tarif patient direct |
| Prix Société | Tarif employé société partenaire |
| Prix Externe | Tarif vente directe sans consultation |

### Chaque article a aussi :
- Date de péremption (optionnelle)
- Fournisseur (optionnel)
- Stock Central (géré par magasinier)
- Stock Pharmacie (géré par pharmacien)
- Seuils minimaux pour chaque dépôt

---

## PARTIE 3 : 2 DÉPÔTS DE STOCK INDÉPENDANTS

```
STOCK CENTRAL (Magasinier)         PHARMACIE (Pharmacien)
├── Achats fournisseur (Sage)      ├── Délivrance patient
├── Entrées avec péremption        ├── Stock local indépendant
├── Transfert vers pharmacie ──▶   ├── Demande réappro ──▶ Magasinier
└── Historique mouvements          └── Alertes rupture
```

### Règles :
- Tous les achats passent par le Stock Central
- Le Magasinier transfère vers la Pharmacie
- La Pharmacie délivre uniquement depuis son propre stock
- Chaque dépôt a ses propres seuils d'alerte (stock d'alerte par article, modifiable)
- **L'alerte peut être désactivée par article et par dépôt** (🔕 central / pharmacie) — plus de badge ni notification, mais la vente reste bloquée en rupture
- **Rupture de stock (quantité 0)** : article listé en rouge dans la saisie assistée des ventes (vente externe, hospitalisation, bloc) et **invendable**

---

## PARTIE 4 : WORKFLOW PATIENT

```
RÉCEPTION ──▶ MÉDECIN ──▶ CAISSE ──▶ PHARMACIE
(sans login)   (login)     (login)    (login)

Double-clic    Saisie Sage  Facture    Délivre
→ Paramètres   (un champ    directe    Stock
→ Type client   recherche   (pas       pharma -1
→ Envoi auto    ↑↓ Entrée)  d'assur.)  Terminé
  TOUS méd.    Remise/ligne
```

### Cas Client Externe (sans consultation) :
```
CAISSE → Onglet Vente Externe → Saisie Sage → "Client Externe" auto → Pharmacie
```

### Cas Hospitalisation / Bloc :
```
MÉDECIN (coche hospit/bloc) → CAISSE (onglet Hospit/Bloc)
→ Recherche patient dans liste réception (ou ajout si absent)
→ Saisie articles un par un (style Sage)
→ Paiements partiels rattachés au caissier
→ Compte continu (ajout articles à tout moment)
```

---

## PARTIE 5 : MODULES DÉTAILLÉS

### 5.1 RÉCEPTION (Sans connexion)

**Tableau principal** (pas de colonne "Type") :
- Colonnes : #, Dossier, Matricule, Nom Prénom, Date Nais, Age, Sexe, Téléphone, Adresse, Statut, Assuré
- Double-clic → Saisie paramètres + envoi auto médecin
- Clic simple → Sélection
- Recherche + filtre statut
- Boutons : Nouveau, Modifier, Supprimer, Blacklist, Actualiser, Imprimer
- Bouton messagerie 💬 dans le header

**Saisie Patient** : Sexe M/F, Nom*, Prénom*, Date naissance (âge auto), Téléphone, Matricule, Assuré, Adresse, Type Client (Comptoir/Société)

**Saisie Paramètres** (double-clic) — champs numériques, vides si non saisis :
- Température, Tension Sys/Dia, Poids, Taille, SpO2, FC, TDR
- Type Client : Comptoir / Société
- Si Société → liste sociétés + sous-société (libre)
- **Pas de remise** (saisie par médecin)
- **Pas de choix médecin** → envoi à TOUS
- Après validation → patient en file d'attente médecin

### 5.2 MÉDECIN (Avec connexion)

**2 compteurs cliquables** :
- **En attente** → clic ramène à la file d'attente
- **Mes consultations (auj.)** → clic affiche le suivi du jour

**Vue "Mes consultations du jour"** :
- Tableau : Heure, Patient, Montant, Statut, Action
- Statuts : ⏳ Attente / ✅ Payé / 💊 Livré
- ⏳ Attente → bouton ✏️ Modifier (réouvre en mode saisie)
- ✅ Payé non livré → bouton 🔄 Retour caisse
- 💊 Livré → aucune action
- **Pas de total en bas**

**Consultation** :
- Constantes + Consultation côte à côte
- **Motif NON obligatoire**, **Diagnostic OBLIGATOIRE** (peut être 2-3 lignes)
- Notes optionnelles
- Options : 🚨 Urgence, Hospitalisation

**Médecin et Caisse peuvent modifier le type de client** à tout moment

**Saisie Prescription — Style Sage Commercial** :
- **UN SEUL champ recherche** (pas de combobox famille)
- Recherche dans TOUTES les familles
- Chaque résultat affiche `[MEDIC] Paracétamol 500mg — 450 Ar`
- **Navigation clavier** : ↑↓ naviguer, Entrée sélectionner, Escape fermer
- Après sélection → charge dans la barre d'édition
- **Pas de consultation 10 000 Ar auto** — le médecin saisit tout

**Barre de saisie en haut du tableau** :
- Champs : Article (recherche), Qté, Posologie, Remise%, P.U. (readonly), Montant (readonly)
- Boutons : Supprimer, Enregistrer
- Focus retour automatique sur la recherche après enregistrement
- Clic sur une ligne du tableau → charge dans la barre du haut

**Tableau prescription** :
- Colonnes : Désignation, Qté, Posologie, Rem%, P.U., Montant
- Ligne sélectionnée en bleu
- Pied : TOTAL

### 5.3 CAISSE (Avec connexion)

**4 compteurs** : En attente, Factures auj., Total auj., Ventes ext.

**5 onglets** :

#### Onglet 1 : 📋 Facturation
- File d'attente patients consultés
- Badges 🏨 Hospit. / 🏥 Bloc si demandé par médecin
- Facture détaillée directe (PAS d'assurance)
- Encaissement + ticket 80x80

#### Onglet 2 : 🛒 Vente Externe — Style Sage
- Nom par défaut **"Client Externe"** (pas de champ nom)
- Saisie identique au médecin (un champ, ↑↓ Entrée)
- **Articles en rupture listés en rouge dans la recherche — non sélectionnables, vente bloquée à l'encaissement**
- Barre édition + tableau avec ligne bleue
- Champ **date de sortie** après le Montant — conservé après validation de la ligne (sorties multiples le même jour)
- Tarif "externe" automatique
- Encaissement + ticket 80x80

#### Onglet 3 : 🏨 Hospitalisation — Paiement partiel
- **Barre de recherche** en haut : filtre par nom patient, dossier, matricule, n° facture, société
- **Recherche patient dans la liste de réception** (saisie assistée)
- **Si patient absent → possibilité d'ajouter** (comme à la réception)
- Auto-détection des demandes d'hospitalisation du médecin
- Saisie articles **un par un** (style Sage, recherche ↑↓) — **ruptures affichées en rouge et invendables**
- Champ **date d'acte / de sortie** après le Montant — la zone n'est **pas effacée** après validation de la ligne (plusieurs sorties le même jour)
- Ajout d'articles **à tout moment** (compte continu)
- **Fond rouge** (bg-red-50) pour les patients **comptoir** qui n'ont **pas totalement payé** leur facture
- Tableau par patient : Total Facture | Paiements Reçus | Reste à Payer
- Versement rattaché au **caissier qui reçoit** avec horodatage
- Fiche dépliable par patient

#### Onglet 4 : 🏥 Bloc Opératoire — Paiement partiel
- Même fonctionnement que Hospitalisation (barre de recherche + fond rouge comptoir impayé)

#### Onglet 5 : 🔒 Clôture de Caisse
**4 sections** :
1. **Total versements par famille** : Consultations, Ventes Ext., Hospit/Bloc
2. **Hospitalisation & Bloc** : Nom, Type, Total Facture, Reçu, Reste, Caissier
3. **Total général de versement** (gros chiffre)
4. **Liste de tous les clients** : Heure, Client, Type, Montant

Bouton **Imprimer ticket 80×80** avec les 4 sections

### 5.4 PHARMACIE (Avec connexion)

**3 onglets** :
1. **Ordonnances payées** → délivrance → stock pharmacie -1
2. **Stock Pharmacie** : Famille, Article, Stock Pharma, Stock Central, Prix, État
3. **Demande Réappro** → envoi au magasinier

### 5.5 MAGASINIER (Avec connexion)

**3 onglets** :

#### Stock Central
- Tableau : Famille, Article, Stock Central, Stock Pharma, P.Achat, Péremption, État
- Recherche, alertes stock bas/rupture

#### Entrées (Achats) — Style Sage
- Saisie avec : Famille, Article, Quantité, Prix achat, Fournisseur, N° BL, **Date péremption**
- Historique des entrées avec toutes les colonnes
- Stock central incrémenté automatiquement

#### Demandes Pharmacie
- Liste des demandes reçues
- Bouton Transférer (vérifie stock suffisant)
- Stock central -N, Stock pharmacie +N

### 5.6 LABORATOIRE (Avec connexion)
- File attente analyses payées (ou urgence)
- Saisie résultats par paramètre
- Comparaison normes automatique
- Alerte rouge si hors normes
- Notification médecin prescripteur

### 5.7 HOSPITALISATION (Avec connexion)
- Attribution lit (Service/Chambre/Lit)
- Plan visuel des lits (occupé/libre)
- Suivi quotidien, sortie

### 5.8 ADMIN (Avec connexion)

**4 onglets** :
1. **Utilisateurs** : Ajout/suppression (ID, Nom, Rôle, MDP)
2. **Articles** : Création avec Nom, Famille, Unité, Prix achat, 3 tarifs de vente
3. **Tarifs** : Modifier les 3 prix par article (clic → édition inline)
4. **Sociétés** : Ajout/suppression sociétés partenaires

### 5.9 MESSAGERIE (Tous les connectés + Réception)
- Liste contacts avec RECEPTION visible par tous
- Messages même si hors ligne → visible à la connexion
- Badge messages non lus
- Conversations horodatées avec indicateur lu
- RECEPTION envoie sous le nom "RECEPTION"

---

## PARTIE 6 : CONFIDENTIALITÉ PAR RÔLE

| Données | Réception | Médecin | Caisse | Pharmacie | Labo | Magasin | Admin |
|---------|-----------|---------|--------|-----------|------|---------|-------|
| Identité patient | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Constantes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Allergies | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Diagnostic | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Prescriptions/Prix | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Historique médical | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Stock central | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Stock pharmacie | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Messagerie | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Modifier type client | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## PARTIE 7 : RÈGLES MÉTIER

1. **Pharmacie ne délivre PAS sans paiement** (exception: urgence vitale)
2. **Pharmacie délivre uniquement depuis son stock local**
3. **Achats → Stock Central → Transfert → Pharmacie**
4. **Remise par article**, saisie par le médecin (pas globale)
5. **Pas d'assurance/mutuelle à la caisse** (montant direct)
6. **Pas de consultation 10 000 Ar auto** — le médecin saisit tout
7. **Vente externe** = nom "Client Externe" par défaut (pas de champ nom)
8. **Paramètres vides** si non saisis par la réception
9. **Diagnostic obligatoire**, motif optionnel
10. **Non livré modifiable** par le médecin (réouvre en mode saisie)
11. **Payé non livré → retour caisse** (annule paiement)
12. **Recherche article UN SEUL champ** (pas de combobox famille) — toutes familles
13. **Navigation clavier** : ↑↓ Entrée Escape dans les listes de recherche
14. **Hospit/Bloc** : recherche patient dans liste réception + ajout si absent
15. **Hospit/Bloc** : saisie articles un par un (pas de montant direct)
16. **Hospit/Bloc** : paiement partiel continu rattaché au caissier
17. **Clôture** : 4 sections (familles, hospit/bloc, total général, liste clients)
18. **Tickets 80×80** pour caisse et clôture
19. **Médecin et Caisse** peuvent modifier le type de client
20. **Ticket hospit/bloc simplifié** : Montant Total, Somme déjà perçue, Paiement actuel, Reste à payer (pas de détail articles)
21. **Barre de recherche hospit/bloc** : filtre par nom, dossier, matricule, n° facture, société
22. **Fond rouge comptoir impayé** : les patients comptoir avec reste > 0 sont affichés en fond rouge dans la liste hospit/bloc
23. **Dossier médical sans doublons** : les analyses labo sont dédupliquées (consultations + state.labRequests)
24. **Échographies** : demandes d'écho saisies par le médecin, facturées en caisse comme le labo

---

## PARTIE 8 : INTERFACES

### RÉCEPTION

```
┌────────────────────────────────────────────────────────────┐
│ 🏥 MediCare HIS        🩺 Att:5  10:05:32   [💬][🔐]    │
│    Réception            📅 Auj:12  Jeudi 20/06/2026       │
├────────────────────────────────────────────────────────────┤
│ 🔍[Rechercher...] [Statut▼]                              │
│ [+Nouveau][Modifier][Supprimer][Blacklist][⟳][🖨]        │
├────────────────────────────────────────────────────────────┤
│ #│Dossier│Matr│Nom Prénom    │Dat/N│Age│Sexe│Tél│Adresse  │
│ 1│MAR101 │M-77│MARTIN JEAN 📊│15/03│39A│ M │034│ANTANAN. │
│>>│DUP102 │M-12│DUPONT MARIE  │22/07│34A│ F │033│TOAMASI. │
│ 3│RAK103 │M-88│RAKOTO SOLO 📊│08/11│9A │ M │032│FIANARA. │
├────────────────────────────────────────────────────────────┤
│ 💡 Double-clic → Paramètres + Envoi auto tous médecins   │
├────────────────────────────────────────────────────────────┤
│ Total:3 │ 🩺 Att:1 │ 📅 Auj:3     MediCare HIS v3.0     │
└────────────────────────────────────────────────────────────┘
```

### SAISIE PARAMÈTRES (Double-clic)

```
┌────────────────────────────────────────────────────┐
│ 📊 SAISIE PARAMÈTRES                          [X] │
│              MARTIN JEAN (MAR101 │ H │ 39An)      │
├────────────────────────────────────────────────────┤
│ (Champs numériques — vides si non saisis)         │
│ T°C[   ] SpO2[   ] PAS[   ] PAD[   ]            │
│ Taille[  ]cm Poids[  ]kg FC[  ]bpm TDR[  ▼]     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│ 🏢 TYPE CLIENT                                    │
│ [Client Société▼] [JIRAMA▼] Sous:[Dir.Rég.___]   │
│ (Remise saisie par le médecin)                    │
│  [🩺 VALIDER & ENVOYER]     [❌ ANNULER]          │
└────────────────────────────────────────────────────┘
```

### CONNEXION PERSONNEL

```
┌────────────────────────────────────────────────────┐
│                    🏥                              │
│               MediCare HIS                         │
│         Connexion Personnel                        │
│ ← Retour réception                                │
├────────────────────────────────────────────────────┤
│ 👤 [DOC001 — Dr. Jean Martin (Médecin)     ▼]    │
│ 🔒 [••••••••                                ]     │
│            [🔓 Se connecter]                      │
├────────────────────────────────────────────────────┤
│ doc123│caisse123│pharma123│mag123                  │
│ labo123│hosp123│admin123                          │
└────────────────────────────────────────────────────┘
```

### MÉDECIN — File d'attente

```
┌────────────────────────────────────────────────────────────┐
│ 🏥 MediCare HIS  🩺 Médecin          [💬 2][🔔3][Déco]  │
│ Dr. Jean Martin (DOC001)                                  │
├────────────────────────────────────────────────────────────┤
│ [⏳ Att: 3 ←clic]         [✅ Mes consult.(auj): 8 ←clic]│
├──────────────┬─────────────────────────────────────────────┤
│ 🔍[Recherch] │                                            │
│ ⏳ File (3)  │        Sélectionnez un patient              │
│ MARTIN JEAN  │                   🩺                        │
│ MAR101•JIRAMA│                                            │
│ ⚠️Pénicilline│                                            │
│ DUPONT MARIE │                                            │
│ DUP102       │                                            │
└──────────────┴─────────────────────────────────────────────┘
```

### MÉDECIN — Consultation (Sage-style)

```
┌────────────────────────────────────────────────────────────┐
│ MARTIN JEAN (MAR101) [📋JIRAMA]       [📜Hist.] [←Retour]│
│ H │ 39 Ans  ⚠️Pénicilline                                │
├──────────────────────────┬─────────────────────────────────┤
│ ❤️ Constantes            │ 📋 Consultation                │
│ T°C[  ] PAS[  ] PAD[  ] │ Motif [________](optionnel)    │
│ FC [  ] SpO2[ ] Pds[  ] │ Diag.*[________](obligatoire)  │
│ Taille[  ]              │       [________](multi-lignes) │
│                          │ Notes [________]                │
│                          │ ☐🚨Urgence ☐Hospit.            │
├──────────────────────────┴─────────────────────────────────┤
│ 💊 PRESCRIPTIONS (Sage — un seul champ recherche)         │
│                                                            │
│┌── BARRE DE SAISIE ────────────────────────────────────┐  │
││ Article (tapez + ↑↓ + Entrée)                         │  │
││ 🔍[para_____________]                                 │  │
││  ┌ [MEDIC] Paracétamol 500mg ────── 450 Ar ← bleu   │  │
││  │ [MEDIC] Paracétamol 1g ────────── 800 Ar          │  │
││  │ [ECHO]  Papier thermique ──────── 1 800 Ar        │  │
││  └── ↑↓ naviguer, Entrée ajouter, Escape fermer     │  │
││                                                       │  │
││ Qté:[20]  Posologie:[1cp 3x/j]  Rem%:[10]           │  │
││ P.U.: 450 Ar          Montant: 8 100 Ar             │  │
││                   [🗑 Supprimer] [💾 Enregistrer]     │  │
│└───────────────────────────────────────────────────────┘  │
│                                                            │
│┌── TABLEAU ────────────────────────────────────────────┐  │
││Désignation    │Qté│Posologie│Rem%│  P.U.│  Montant   │  │
│├───────────────┼───┼─────────┼────┼──────┼────────────┤  │
││████████████████████████████████████████████████████████│  │
││Consultation   │  1│         │  — │10 000│    10 000  │  │
│├───────────────┼───┼─────────┼────┼──────┼────────────┤  │
││Paracétamol 500│ 20│ 1cp 3x/j│ 10%│   450│     8 100  │  │
│├───────────────┼───┼─────────┼────┼──────┼────────────┤  │
││Oméprazole 20  │ 10│ 1cp/j   │  — │ 1 000│    10 000  │  │
│├───────────────┴───┴─────────┴────┼──────┼────────────┤  │
││                             TOTAL│      │    28 100   │  │
│└──────────────────────────────────┴──────┴────────────┘  │
│ Clic ligne → charge en haut │ Focus auto après enreg.   │
├────────────────────────────────────────────────────────────┤
│         [📤 Valider — 28 100 Ar]                          │
└────────────────────────────────────────────────────────────┘
```

### MÉDECIN — Mes consultations du jour

```
┌────────────────────────────────────────────────────────────┐
│ ✅ Consultations du jour                      [← File]    │
├──────┬─────────────────┬──────────┬─────────┬─────────────┤
│Heure │ Patient         │ Montant  │ Statut  │ Action      │
├──────┼─────────────────┼──────────┼─────────┼─────────────┤
│10:15 │MARTIN Jean      │28 100 Ar │⏳Attente│ ✏️Modifier  │
│09:30 │DUPONT Marie     │12 500 Ar │✅ Payé  │ 🔄Caisse    │
│08:45 │RAKOTO Solo      │ 8 000 Ar │💊 Livré │     —       │
│08:00 │BENALI Fatima    │15 000 Ar │✅ Payé  │ 🔄Caisse    │
└──────┴─────────────────┴──────────┴─────────┴─────────────┘
```

### CAISSE — Onglet Facturation

```
┌────────────────────────────────────────────────────────────┐
│ 🏥 MediCare HIS  💳 Caisse           [💬 1][🔔2][Déco]   │
├────────────────────────────────────────────────────────────┤
│ [⏳Att:2] [✅Fact:8] [💰Auj:450 000] [🛒Ext:50 000]     │
├────────────────────────────────────────────────────────────┤
│ [📋Facturation(2)][🛒Vte Ext.][🏨Hospit.][🏥Bloc][🔒Clôt]│
├──────────────┬─────────────────────────────────────────────┤
│ ⏳ FILE      │ FACTURE — MARTIN JEAN (MAR101)              │
│ ●MARTIN JEAN │ Dr.Jean Martin │ Angine de poitrine         │
│  🏨Hospit.   │────────────────────────────────────────────│
│ ○DUPONT MARIE│ Consultation               10 000 Ar      │
│              │ Paracétamol ×20 (-10%)       8 100 Ar      │
│              │ Oméprazole ×10              10 000 Ar      │
│              │ ═══════════════════════════════════         │
│              │ À PAYER:                    28 100 Ar       │
│              │ (pas d'assurance)                           │
│              │ [💳 Encaisser 28 100 Ar] → ticket 80×80    │
└──────────────┴─────────────────────────────────────────────┘
```

### CAISSE — Vente Externe (Sage-style)

```
┌────────────────────────────────────────────────────────────┐
│ 🛒 Vente Directe — Client Externe (tarif externe auto)   │
│ Nom par défaut: "Client Externe" (pas de champ)           │
│                                                            │
│┌── BARRE SAGE ─────────────────────────────────────────┐  │
││ 🔍[para_______] Qté:[10] Rem%:[0]                     │  │
││  ┌ Paracétamol 500mg ── 600 Ar ── clic ──┐           │  │
││ P.U.: 600 Ar  Montant: 6 000 Ar                      │  │
││                   [🗑 Supprimer] [💾 Enregistrer]      │  │
│└───────────────────────────────────────────────────────┘  │
│┌── TABLEAU ────────────────────────────────────────────┐  │
││ Article             │Qté│Rem%│  P.U.│   Montant      │  │
││ ████████████████████████████████████████████████████   │  │
││ Paracétamol 500 × 10│ 10│  — │   600│     6 000      │  │
││ Ibuprofène 400 × 5  │  5│  — │ 1 000│     5 000      │  │
││                 TOTAL│   │    │      │    11 000       │  │
│└──────────────────────────────────────────────────────┘  │
│ [💳 Encaisser 11 000 Ar] → ticket 80×80                  │
└────────────────────────────────────────────────────────────┘
```

### CAISSE — Hospitalisation / Bloc (saisie articles + paiement partiel)

```
┌────────────────────────────────────────────────────────────┐
│ 🏨 Hospitalisation — Paiement Partiel + Saisie articles   │
│                                                            │
│ 🔍[Rechercher patient, dossier, n° facture, société...    ]│
│                                                            │
│ Patient: 🔍[Rechercher dans liste réception...        ]   │
│          ┌ MARTIN JEAN (MAR101) ── clic ──┐               │
│          │ DUPONT MARIE (DUP102) ──────────│               │
│          │ Pas trouvé ? [+ Ajouter patient]│               │
│          └─────────────────────────────────┘    [+Patient] │
│                                                            │
│ ┌── MARTIN JEAN ──── Facture: 85 000 │ Payé: 50 000 │    │
│ │ (bg rouge si comptoir impayé)   Reste: 35 000 Ar   ▼│    │
│ │ ┌────────────────────────────────────────────────┐  │    │
│ │ │ Article        │Qté│ P.U.  │ Montant          │  │    │
│ │ │ Lit chambre 201│  5│15 000 │  75 000          │  │    │
│ │ │ Perfusion NaCl │  2│ 5 000 │  10 000          │  │    │
│ │ └────────────────────────────────────────────────┘  │    │
│ │ 🔍[Ajouter article...] Qté:[1] P.U.: ... [💾]     │    │
│ │                                                     │    │
│ │ Versement: [25 000] Ar  [💰 Payer]                  │    │
│ │ Historique: 10:05 — 25 000 Ar — Pierre Duval       │    │
│ │             09:30 — 25 000 Ar — Pierre Duval       │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                            │
│ ┌── DUPONT MARIE ──── Facture: 500 000 │ Payé: 0 │       │
│ │ (bg rouge = comptoir impayé)    Reste: 500 000 ▼│      │
│ │ ...                                                │      │
│ └────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
```

### CAISSE — Ticket Encaissement Hospit/Bloc (simplifié)

```
┌──────────────────────────────────────┐
│         CLINIQUE SALFA               │
│       Antananarivo, MG               │
│                                      │
│  REÇU DE PAIEMENT — HOSPITALISATION  │
│  N° FAC-2026-0042 · 23/07/2026      │
│                                      │
│  MARTIN JEAN                         │
│  Dossier : MAR101                    │
│  Caissier : Pierre Duval             │
│                                      │
│  Montant Total      85 000 Ar        │
│  Somme déjà perçue  50 000 Ar        │
│  Paiement actuel    25 000 Ar        │
│  Reste à payer      10 000 Ar        │
│                                      │
│  *FAC-2026-0042*                     │
│                                      │
│  Pierre Duval     Client             │
└──────────────────────────────────────┘
```

### CAISSE — Ticket Encaissement Hospit/Bloc (simplifié)

Le ticket d'encaissement hospit/bloc n'affiche que le résumé (pas de détail articles) :
- **Montant Total** de la facture
- **Somme déjà perçue** (cumul des versements)
- **Paiement actuel** (montant de ce versement)
- **Reste à payer** (solde restant après ce versement)

### CAISSE — Clôture

```
┌────────────────────────────────────────────────────────────┐
│ 🔒 CLÔTURE — 20/06/2026 — Pierre Duval  [🖨 Ticket 80×80]│
├────────────────────────────────────────────────────────────┤
│ 1. VERSEMENTS PAR FAMILLE                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│ │Consultations │ │Ventes ext.   │ │Hospit/Bloc   │       │
│ │ 350 000 Ar   │ │ 50 000 Ar    │ │ 75 000 Ar    │       │
│ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                            │
│ 2. HOSPITALISATION & BLOC                                  │
│ Patient      │Type │Total Fact│Reçu     │Reste    │Caissier│
│ MARTIN JEAN  │Hosp.│ 85 000   │ 50 000  │ 35 000  │P.Duval│
│ BENALI Fatima│Bloc │500 000   │200 000  │300 000  │P.Duval│
│                                                            │
│ 3. TOTAL GÉNÉRAL                                           │
│ ╔══════════════════════════════╗                           │
│ ║       475 000 Ar            ║                           │
│ ╚══════════════════════════════╝                           │
│                                                            │
│ 4. LISTE CLIENTS                                           │
│ Heure│Client       │Type      │Montant                    │
│ 10:20│MARTIN Jean  │Consult.  │28 100 Ar                  │
│ 10:05│Client Ext.  │🛒Externe │11 000 Ar                  │
│   —  │MARTIN Jean  │🏨Hosp.   │50 000 Ar                  │
│   —  │BENALI Fatima│🏥Bloc    │200 000 Ar                 │
│                    │TOTAL     │475 000 Ar                  │
└────────────────────────────────────────────────────────────┘
```

### PHARMACIE

```
┌────────────────────────────────────────────────────────────┐
│ [📋 Ordonnances(2)] [📦 Stock Pharmacie] [📩 Demande]    │
├──────────────┬─────────────────────────────────────────────┤
│ ⏳ PAYÉES    │ MARTIN JEAN (MAR101) — ✅ PAYÉ              │
│ ●MARTIN JEAN │ Article       │Qté│Posologie│Stock Pharma  │
│   2 articles │ Paracétamol500│ 20│ 1cp 3x/j│   120 ✅    │
│ ○DUPONT MARIE│ Oméprazole 20 │ 10│ 1cp/j   │    45 ✅    │
│              │      [✅ DÉLIVRER]                          │
└──────────────┴─────────────────────────────────────────────┘
```

### MAGASINIER

```
┌────────────────────────────────────────────────────────────┐
│ [📦 Stock Central] [📥 Entrées(Achats Sage)] [📩 Dem.(2)]│
├────────────────────────────────────────────────────────────┤
│ Famille│Article      │St.Cen│St.Pha│P.Achat│Péremp│État  │
│ MEDIC  │Paracét.500  │  800 │  120 │200 Ar │12/27 │✅OK  │
│ MEDIC  │Amoxicill.1g │   45 │   45 │1000Ar │06/26 │⚠️BAS │
│ ECHO   │Gel écho     │    3 │    4 │2000Ar │  —   │🚨RUP │
│                                                            │
│ [📥 Entrées — Style Sage] :                                │
│ Famille:[▼] Article:[▼] Qté:[  ] P.Achat:[  ]Ar          │
│ Fournisseur:[______] N°BL:[______] 📅Péremption:[__/__]   │
│ [📥 Enregistrer]                                          │
│ Historique: Date│Article│Qté│PA│Fournisseur│Péremption    │
│                                                            │
│ [📩 Demandes]: Article│Qté│Stock│[📤 Transférer]          │
└────────────────────────────────────────────────────────────┘
```

### ADMIN

```
┌────────────────────────────────────────────────────────────┐
│ [👥 Utilisateurs] [📦 Articles] [💰 Tarifs] [🏢 Sociétés]│
├────────────────────────────────────────────────────────────┤
│ [👥] [+Nouvel utilisateur]                                │
│ ID│Nom│Rôle│MDP│[🗑]                                      │
│                                                            │
│ [📦] [+Nouvel article]                                     │
│ Nom:[___] Famille:[▼] Unité:[___]                         │
│ P.Achat:[__] P.Comptoir:[__] P.Société:[__] P.Externe:[__]│
│ [✅ Enregistrer]                                           │
│ Tableau: Fam│Nom│Unité│PA│PC│PS│PE│Stocks C/P             │
│                                                            │
│ [💰] Clic article → édition inline 3 prix                 │
│ [🏢] [+Nouvelle société] JIRAMA TELMA AIR MAD [🗑]        │
└────────────────────────────────────────────────────────────┘
```

### MESSAGERIE

```
┌────────────────────────────────────────────────────────────┐
│ 💬 MESSAGERIE — Pierre Duval                         [X]  │
├──────────────┬─────────────────────────────────────────────┤
│ RECEPTION (2)│ [10:05] Dr.Martin: Stock Paracétamol ?     │
│ Dr.J.Martin  │ [10:06] Vous: 120 en pharmacie             │
│ Fatima Benali│ [10:08] Dr.Martin: OK merci                │
│ Ali Rasolofo │                                             │
│ Admin Système│ 📩 Messages même si hors ligne              │
├──────────────┤                                             │
│              │ [Votre message...              ] [Envoyer]  │
└──────────────┴─────────────────────────────────────────────┘
```

### LABORATOIRE

```
┌────────────────────────────────────────────────────────────┐
│ [⏳ Attente:2] [🔬 En cours:1] [✅ Terminées:12]         │
├────────────────────────────────────────────────────────────┤
│ 🔬 SAISIE — Bilan lipidique — MARTIN JEAN                │
│ ┌────────────────┬────────┬──────┬─────────┬──────────┐  │
│ │ Paramètre      │Résultat│ Unité│ Normes  │ État     │  │
│ │Cholestérol Tot.│[ 2.45 ]│ g/L  │1.5-2.0  │🔴 ÉLEVÉ  │  │
│ │HDL             │[ 0.55 ]│ g/L  │0.4-0.6  │🟢 Normal │  │
│ │LDL             │[ 1.80 ]│ g/L  │0.7-1.6  │🔴 ÉLEVÉ  │  │
│ └────────────────┴────────┴──────┴─────────┴──────────┘  │
│            [✅ VALIDER → Notif. médecin]                  │
└────────────────────────────────────────────────────────────┘
```

---

## PARTIE 9 : STRUCTURE DES DONNÉES

```typescript
interface Article {
  id: string;
  name: string;
  family: 'MEDIC' | 'LABO' | 'DENT' | 'ECHO';
  unit: string;
  barcode?: string;
  purchasePrice: number;      // Prix achat (Ar)
  priceComptoir: number;      // Tarif comptoir
  priceSociete: number;       // Tarif société
  priceExterne: number;       // Tarif externe
  stockCentral: number;
  stockPharmacie: number;
  minStockCentral: number;
  minStockPharmacie: number;
  expiryDate?: string;        // Péremption
  supplier?: string;
}

interface Patient {
  id: string;
  dossier: string;            // Auto "MAR101"
  matricule?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: string;                // Calculé
  gender: 'M' | 'F';
  address: string;
  contact: string;
  ssn: string;
  insureName?: string;
  clientType: 'comptoir' | 'societe';  // Modifiable par médecin/caisse
  company?: string;
  subCompany?: string;
  allergies: string[];        // Caché réception
  chronicTreatments: string[];
  vitalSigns?: VitalSigns;    // Vides si non saisis
  status: PatientStatus;
  registeredAt: string;
  registeredBy: string;
  blacklisted?: boolean;
}

interface VitalSigns {
  temperature: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  heartRate: string;
  oxygenSaturation: string;
  weight: string;
  height: string;
  tdr?: string;
}

type PatientStatus =
  | 'registered'
  | 'waiting_consultation'
  | 'in_consultation'
  | 'consulted_awaiting_payment'
  | 'invoice_paid'
  | 'medications_delivered'
  | 'analyses_pending'
  | 'analyses_complete'
  | 'hospitalized'
  | 'surgery_planned'
  | 'discharged'
  | 'completed';

interface Prescription {
  id: string;
  articleId: string;
  articleName: string;
  quantity: number;
  posology: string;           // "1cp 3x/jour"
  duration: string;
  instructions: string;
  unitPrice: number;
  discount: number;           // Remise % PAR LIGNE
  delivered: boolean;
}

interface Consultation {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  date: string;
  vitalSigns: VitalSigns;
  visitReason: string;        // Optionnel
  diagnosis: string;          // Obligatoire
  notes: string;
  prescriptions: Prescription[];
  labRequests: LabRequest[];
  hospitalizeRequested: boolean;
  surgeryRequested: boolean;
  isEmergency: boolean;
}

interface Invoice {
  id: string;
  patientId?: string;
  consultationId?: string;
  clientName?: string;        // "Client Externe" par défaut
  clientType: 'comptoir' | 'societe' | 'externe';
  items: InvoiceItem[];
  totalAmount: number;
  patientCharge: number;      // = totalAmount (pas d'assurance)
  isExternal: boolean;
  status: 'pending' | 'paid';
  paidAt?: string;
  paidBy?: string;
  createdAt: string;
}

interface InvoiceItem {
  description: string;
  amount: number;
  category: 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization';
}

interface StockEntry {
  id: string;
  articleId: string;
  articleName: string;
  quantity: number;
  purchasePrice: number;
  supplier: string;
  invoiceRef: string;
  expiryDate?: string;        // Date péremption
  date: string;
  enteredBy: string;
}

interface StockTransfer {
  id: string;
  articleId: string;
  articleName: string;
  quantity: number;
  status: 'requested' | 'transferred';
  requestedBy?: string;
  transferredBy?: string;
  requestedAt?: string;
  transferredAt?: string;
}

interface Message {
  id: string;
  fromUserId: string;         // "RECEPTION" pour réception
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  content: string;
  timestamp: string;
  read: boolean;
}

interface HbRecord {           // Hospitalisation/Bloc
  id: string;
  patientName: string;
  type: 'hospit' | 'bloc';
  lines: HbLine[];            // Articles facturés un par un
  payments: {                 // Versements partiels
    amount: number;
    paidBy: string;           // Nom du caissier
    date: string;
  }[];
}

interface HbLine {
  id: string;
  articleName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface LabRequest {
  id: string;
  examType: string;
  parameters: string[];
  urgent: boolean;
  status: 'pending' | 'paid' | 'in_progress' | 'completed';
  results?: LabResult[];
  completedAt?: string;
  completedBy?: string;
}

interface LabResult {
  parameter: string;
  value: number;
  unit: string;
  normalMin: number;
  normalMax: number;
  isAbnormal: boolean;
}

interface HospitalizationRecord {
  id: string;
  patientId: string;
  consultationId: string;
  service: string;
  roomNumber: string;
  bedNumber: string;
  admissionDate: string;
  dischargeDate?: string;
  dailyNotes: DailyNote[];
  status: 'active' | 'discharged';
}

interface DailyNote {
  id: string;
  date: string;
  authorId: string;
  authorName: string;
  vitalSigns?: Partial<VitalSigns>;
  nursingCare: string;
  doctorObservations: string;
  medicationsAdministered: string[];
}

interface Bed {
  id: string;
  service: string;
  roomNumber: string;
  bedNumber: string;
  occupied: boolean;
  patientId?: string;
}

interface Company {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  role: UserRole;
  password?: string;
}

type UserRole = 'receptionist' | 'doctor' | 'cashier' | 'pharmacy'
  | 'magasinier' | 'laboratory' | 'hospitalization' | 'admin';

type ClientType = 'comptoir' | 'societe' | 'externe';
type ArticleFamily = 'MEDIC' | 'LABO' | 'DENT' | 'ECHO';
```

---

## PARTIE 10 : PRIX DE RÉFÉRENCE (Ar)

| Article | Achat | Comptoir | Société | Externe |
|---------|-------|----------|---------|---------|
| Paracétamol 500mg | 200 | 500 | 450 | 600 |
| Amoxicilline 1g | 1 000 | 2 000 | 1 800 | 2 500 |
| Ibuprofène 400mg | 350 | 800 | 700 | 1 000 |
| Oméprazole 20mg | 500 | 1 200 | 1 000 | 1 500 |
| Metformine 850mg | 400 | 900 | 800 | 1 100 |
| Amlodipine 5mg | 700 | 1 500 | 1 300 | 1 800 |
| Tube EDTA | 100 | 300 | 250 | 400 |
| Réactif Glycémie | 2 500 | 5 000 | 4 500 | 6 000 |
| Bandelette urinaire | 1 500 | 3 000 | 2 500 | 3 500 |
| Composite dentaire | 8 000 | 15 000 | 12 000 | 18 000 |
| Anesthésique dent. | 1 200 | 3 000 | 2 500 | 3 500 |
| Gel échographie | 2 000 | 5 000 | 4 000 | 6 000 |
| Papier thermique | 800 | 2 000 | 1 800 | 2 500 |

### Sociétés partenaires
JIRAMA, TELMA, AIR MADAGASCAR, AMBATOVY, QMM/RIO TINTO, STAR BRASSERIES, BNI MADAGASCAR, SOCIMEX

### Normes Laboratoire
- Globules Rouges: 4.0–5.5 T/L
- Globules Blancs: 4.0–10.0 G/L
- Hémoglobine: 12.0–17.0 g/dL
- Plaquettes: 150–400 G/L
- Glucose: 0.7–1.1 g/L
- Cholestérol Total: 1.5–2.0 g/L
- HDL: 0.4–0.6 g/L
- LDL: 0.7–1.6 g/L
- ASAT/ALAT: 5–40 UI/L
- Créatinine: 6–12 mg/L
- CRP: 0–5 mg/L

---

## PARTIE 11 : TECHNOLOGIES

- **Frontend** : React 19 + TypeScript + Vite + Tailwind CSS 4
- **Icônes** : Lucide React
- **IDs** : uuid v4
- **État** : useState React (pas de backend)
- **Impression** : window.print() via modale ticket 80×80
- **Monnaie** : Ariary (Ar), formaté avec séparateur de milliers FR
- **Saisie article** : Style Sage Commercial (barre édition en haut + tableau en bas)
- **Navigation** : ↑↓ Entrée Escape dans toutes les listes de recherche

---

**FIN DU PROMPT — MediCare HIS v4.0**
