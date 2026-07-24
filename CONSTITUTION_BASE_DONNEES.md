# 📊 CONSTITUTION DE LA BASE DE DONNÉES — RECEPTION SALFA

> **Date :** 23 Juillet 2026  
> **Projet :** MediCare HIS v4.0 — Gestion de clinique / centre de santé

---

## 🗂️ STRUCTURE GÉNÉRALE

La base de données est de type **NoSQL in-memory** (état React `AppState`) avec persistance côté navigateur.  
Toutes les entités sont stockées dans des tableaux typés TypeScript.

---

## 📋 1. TABLE `patients`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `dossier` | `string` | Numéro de dossier (ex: AND104) |
| `matricule` | `string?` | Matricule employé |
| `firstName` | `string` | Prénom |
| `lastName` | `string` | Nom |
| `dateOfBirth` | `string (ISO)` | Date de naissance |
| `age` | `string` | Âge calculé |
| `gender` | `'M' \| 'F'` | Sexe |
| `address` | `string` | Adresse |
| `contact` | `string` | Téléphone |
| `ssn` | `string` | N° sécurité sociale |
| `insureName` | `string?` | Nom assureur |
| `clientType` | `'comptoir' \| 'societe' \| 'externe'` | Type de client |
| `company` | `string?` | Société (si clientType = 'societe') |
| `subCompany` | `string?` | Sous-entité |
| `allergies` | `string[]` | Allergies connues |
| `chronicTreatments` | `string[]` | Traitements chroniques |
| `antecedents` | `string[]` | Antécédents médicaux |
| `bloodGroup` | `string?` | Groupe sanguin |
| `vitalSigns` | `VitalSigns?` | Constantes vitales |
| `registeredAt` | `string (ISO)` | Date d'enregistrement |
| `registeredBy` | `string` | Enregistré par (id user) |
| `status` | `PatientStatus` | Statut dans le parcours |
| `lastVisitAt` | `string?` | Date dernière visite |
| `assignedDoctor` | `string?` | Médecin assigné |
| `assignedSpecialty` | `string?` | Spécialité |
| `blacklisted` | `boolean?` | Bloqué ? |
| `blacklistReason` | `string?` | Motif blacklist |
| `blacklistDate` | `string?` | Date blacklist |

**Statuts possibles (`PatientStatus`) :**
`registered` → `waiting_consultation` → `in_consultation` → `consulted_awaiting_payment` → `invoice_paid` → `medications_delivered` → `analyses_pending` → `analyses_complete` → `completed`

---

## 📋 2. TABLE `VitalSigns` (sous-structure)

| Champ | Type | Description |
|-------|------|-------------|
| `temperature` | `string` | Température (°C) |
| `bloodPressureSystolic` | `string` | Tension systolique |
| `bloodPressureDiastolic` | `string` | Tension diastolique |
| `heartRate` | `string` | Fréquence cardiaque |
| `oxygenSaturation` | `string` | SpO2 (%) |
| `weight` | `string` | Poids (kg) |
| `height` | `string` | Taille (cm) |
| `tdr` | `string?` | TDR (Positif/Négatif) |

---

## 📋 3. TABLE `consultations`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `patientId` | `string` | FK → patients.id |
| `doctorId` | `string` | FK → users.id |
| `doctorName` | `string` | Nom du médecin |
| `date` | `string (ISO)` | Date consultation |
| `vitalSigns` | `VitalSigns` | Constantes |
| `visitReason` | `string` | Motif de visite |
| `diagnosis` | `string` | Diagnostic |
| `notes` | `string` | Notes médicales |
| `prescriptions` | `Prescription[]` | Lignes d'ordonnance |
| `labRequests` | `LabRequest[]` | Demandes d'analyses |
| `echoRequests` | `EchoRequest[]?` | Demandes d'échographie |
| `hospitalizeRequested` | `boolean` | Hospitalisation demandée ? |
| `surgeryRequested` | `boolean` | Chirurgie demandée ? |
| `isEmergency` | `boolean` | Urgence ? |

---

## 📋 4. TABLE `Prescription` (sous-structure)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `articleId` | `string` | FK → articles.id |
| `articleName` | `string` | Nom article |
| `quantity` | `number` | Quantité prescrite |
| `posology` | `string` | Posologie |
| `duration` | `string` | Durée traitement |
| `instructions` | `string` | Instructions |
| `unitPrice` | `number` | Prix unitaire |
| `discount` | `number` | Remise % |
| `delivered` | `boolean` | Délivré ? |

---

## 📋 5. TABLE `articles`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `name` | `string` | Nom de l'article |
| `family` | `'MEDIC' \| 'LABO' \| 'DENT' \| 'ECHO'` | Famille |
| `unit` | `string` | Unité (comprimé, flacon...) |
| `barcode` | `string?` | Code-barres |
| `priceComptoir` | `number` | Prix client comptoir |
| `priceSociete` | `number` | Prix client société |
| `priceExterne` | `number` | Prix client externe |
| `purchasePrice` | `number` | Prix d'achat |
| `stockCentral` | `number` | Stock dépôt central |
| `stockPharmacie` | `number` | Stock pharmacie |
| `minStockCentral` | `number` | Stock d'alerte (seuil) central |
| `minStockPharmacie` | `number` | Stock d'alerte (seuil) pharmacie |
| `alertDisabledCentral` | `boolean?` | Alerte stock désactivée (central) |
| `alertDisabledPharmacie` | `boolean?` | Alerte stock désactivée (pharmacie) |
| `serviceStocks` | `Record<string, number>?` | Stocks par service |
| `serviceMinStocks` | `Record<string, number>?` | Seuils mini par service |
| `expiryDate` | `string?` | Date péremption |
| `supplier` | `string?` | Fournisseur |
| `saleBlocked` | `boolean?` | Vente bloquée ? |
| `saleBlockReason` | `string?` | Motif blocage vente |
| `saleBlockedAt` | `string?` | Date blocage |
| `saleBlockedBy` | `string?` | Bloqué par (userId) |

---

## 📋 6. TABLE `invoices` (factures)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `patientId` | `string?` | FK → patients.id |
| `consultationId` | `string?` | FK → consultations.id |
| `clientName` | `string?` | Nom client (externes) |
| `clientType` | `ClientType` | Type client |
| `items` | `InvoiceItem[]` | Lignes de facture |
| `totalAmount` | `number` | Montant total |
| `patientCharge` | `number` | À charge patient |
| `status` | `'pending' \| 'paid'` | Statut |
| `paidAt` | `string?` | Date paiement |
| `paidBy` | `string?` | Payé par (userId) |
| `createdAt` | `string (ISO)` | Date création |
| `isExternal` | `boolean` | Vente externe ? |
| `closingId` | `string?` | FK → cashClosings.id |

---

## 📋 7. TABLE `InvoiceItem` (sous-structure)

| Champ | Type | Description |
|-------|------|-------------|
| `description` | `string` | Libellé |
| `amount` | `number` | Montant |
| `category` | `'consultation' \| 'lab' \| 'pharmacy' \| 'surgery' \| 'hospitalization' \| 'echo'` | Catégorie |

---

## 📋 8. TABLE `labRequests` (demandes d'analyses)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `patientId` | `string?` | FK → patients.id |
| `consultationId` | `string?` | FK → consultations.id |
| `examType` | `string` | Type d'examen |
| `code` | `string?` | Code catalogue |
| `category` | `LabCategory?` | Catégorie |
| `parameters` | `string[]` | Paramètres mesurés |
| `urgent` | `boolean` | Urgent ? |
| `status` | `'pending' \| 'paid' \| 'sample_received' \| 'in_progress' \| 'completed'` | Statut |
| `sampleType` | `string?` | Type de prélèvement |
| `sampleReceived` | `boolean?` | Échantillon reçu ? |
| `sampleReceivedAt` | `string?` | Date réception |
| `requestedBy` | `string?` | Demandeur (userId) |
| `requestedAt` | `string?` | Date demande |
| `invoiceId` | `string?` | FK → invoices.id |
| `price` | `number?` | Prix |
| `results` | `LabResult[]?` | Résultats |
| `completedAt` | `string?` | Date complétion |
| `completedBy` | `string?` | Complété par |
| `validatedBy` | `string?` | Validé par |

---

## 📋 9. TABLE `LabResult` (sous-structure)

| Champ | Type | Description |
|-------|------|-------------|
| `parameter` | `string` | Paramètre |
| `value` | `number` | Valeur mesurée |
| `unit` | `string` | Unité |
| `normalMin` | `number` | Norme min |
| `normalMax` | `number` | Norme max |
| `isAbnormal` | `boolean` | Anormal ? |

---

## 📋 10. TABLE `labCatalog` (catalogue examens labo)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `code` | `string` | Code examen |
| `name` | `string` | Nom examen |
| `category` | `LabCategory` | Catégorie |
| `parameters` | `string[]` | Paramètres |
| `sampleType` | `string` | Type prélèvement |
| `priceComptoir` | `number` | Prix comptoir |
| `priceSociete` | `number` | Prix société |
| `priceExterne` | `number` | Prix externe |
| `urgentPrice` | `number` | Prix urgent |
| `durationHours` | `number` | Délai (heures) |

---

## 📋 11. TABLE `echoRequests` (demandes d'échographie)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `patientId` | `string?` | FK → patients.id |
| `consultationId` | `string?` | FK → consultations.id |
| `examType` | `string` | Type d'écho |
| `notes` | `string?` | Notes / indication |
| `urgent` | `boolean` | Urgent ? |
| `status` | `'pending' \| 'paid' \| 'completed'` | Statut |
| `requestedBy` | `string?` | Demandeur |
| `requestedAt` | `string?` | Date demande |
| `invoiceId` | `string?` | FK → invoices.id |
| `price` | `number?` | Prix |
| `completedAt` | `string?` | Date complétion |

---

## 📋 12. TABLE `HbLine` — Lignes de vente Hospitalisation / Bloc

> **⚠️ La date de sortie (`dateSort`) est conservée dans la base pour l'historique de sortie du malade, même si elle a été supprimée de l'interface de saisie.**

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `articleName` | `string` | Nom article |
| `quantity` | `number` | Quantité |
| `unitPrice` | `number` | Prix unitaire |
| `discount` | `number` | Remise % |
| `dateSort` | `string?` | 📅 **Date d'acte / de sortie** — conservée pour l'historique |

---

## 📋 13. TABLE `HbRecord` — En-tête Hospitalisation / Bloc

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `patientId` | `string?` | FK → patients.id |
| `patientName` | `string` | Nom patient |
| `clientType` | `ClientType` | Type client |
| `company` | `string?` | Société |
| `type` | `'hospit' \| 'bloc'` | Type |
| `lines` | `HbLine[]` | Lignes de prescription |
| `payments` | `{amount: number, paidBy: string, date: string}[]` | Paiements partiels |

---

## 📋 14. TABLE `cashClosings` (clôtures de caisse)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `date` | `string (ISO)` | Date |
| `cashierId` | `string` | Caissier |
| `cashierName` | `string` | Nom caissier |
| `invoiceIds` | `string[]` | Factures clôturées |
| `invoiceCount` | `number` | Nombre factures |
| `consultationTotal` | `number` | Total consultations |
| `externalTotal` | `number` | Total ventes externes |
| `hospitalizationTotal` | `number` | Total hospit/bloc |
| `grandTotal` | `number` | Total général |
| `createdAt` | `string (ISO)` | Date création |

---

## 📋 15. TABLE `stockTransfers` (transferts de stock)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `articleId` | `string` | FK → articles.id |
| `articleName` | `string` | Nom article |
| `quantity` | `number` | Quantité |
| `category` | `'central' \| 'hospitalisation' \| 'bloc' \| 'approvisionnement'` | Catégorie |
| `purchasePrice` | `number?` | Prix achat |
| `expiryDate` | `string?` | Péremption |
| `supplier` | `string?` | Fournisseur |
| `invoiceRef` | `string?` | Réf. facture |
| `requestedBy` | `string?` | Demandeur |
| `requestedAt` | `string?` | Date demande |
| `transferredBy` | `string?` | Transféré par |
| `transferredAt` | `string?` | Date transfert |
| `status` | `'requested' \| 'transferred' \| 'cancelled'` | Statut |
| `notes` | `string?` | Notes |
| `targetServiceId` | `string?` | Service cible |
| `targetServiceName` | `string?` | Nom service cible |
| `requestSource` | `'pharmacy' \| 'hospitalisation' \| 'magasinier' \| 'other'?` | Source demande |

---

## 📋 16. TABLE `stockEntries` (entrées stock)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `articleId` | `string` | FK → articles.id |
| `articleName` | `string` | Nom article |
| `quantity` | `number` | Quantité |
| `purchasePrice` | `number` | Prix achat |
| `supplier` | `string` | Fournisseur |
| `invoiceRef` | `string` | Réf. facture |
| `expiryDate` | `string?` | Péremption |
| `date` | `string (ISO)` | Date |
| `enteredBy` | `string` | Saisi par |
| `category` | `TransferCategory?` | Catégorie |
| `destination` | `'central'?` | Destination |

---

## 📋 17. TABLE `stockMovements` (mouvements legacy)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `type` | `'entry' \| 'exit' \| 'transfer' \| 'inventory_adjust'` | Type |
| `articleId` | `string` | Article |
| `articleName` | `string` | Nom article |
| `quantity` | `number` | Quantité |
| `fromLocation` | `StockLocation` | Origine |
| `toLocation` | `StockLocation` | Destination |
| `reason` | `string?` | Motif |
| `ref` | `string?` | Référence |
| `date` | `string (ISO)` | Date |
| `userId` | `string` | Utilisateur |
| `userName` | `string?` | Nom utilisateur |
| `serviceId` | `string?` | Service |
| `serviceName` | `string?` | Nom service |

---

## 📋 18. TABLE `movementHeaders` (en-têtes de mouvement)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `type` | `'achat' \| 'vente' \| 'transfert' \| 'inventaire' \| 'sortie'` | Type |
| `ref` | `string?` | Référence (N° BL, facture…) |
| `date` | `string (ISO)` | Date |
| `userId` | `string` | Utilisateur |
| `userName` | `string?` | Nom utilisateur |
| `fromLocation` | `StockLocation?` | Origine |
| `toLocation` | `StockLocation?` | Destination |
| `totalQuantity` | `number?` | Quantité totale |
| `notes` | `string?` | Notes |
| `status` | `'completed' \| 'cancelled'?` | Statut |

---

## 📋 19. TABLE `movementLines` (lignes de mouvement)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `movementId` | `string` | FK → movementHeaders.id |
| `articleId` | `string` | Article |
| `articleName` | `string` | Nom article |
| `quantity` | `number` | Quantité |
| `unitPrice` | `number?` | Prix unitaire |
| `purchasePrice` | `number?` | Prix achat |
| `reason` | `string?` | Motif |

---

## 📋 20. TABLE `inventorySessions` (inventaires)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `location` | `StockLocation` | Emplacement |
| `locationLabel` | `string` | Libellé emplacement |
| `status` | `'in_progress' \| 'completed' \| 'cancelled'` | Statut |
| `startedAt` | `string (ISO)` | Début |
| `completedAt` | `string?` | Fin |
| `startedBy` | `string` | Initié par |
| `startedByName` | `string?` | Nom |
| `lines` | `InventoryLine[]` | Lignes |
| `notes` | `string?` | Notes |

---

## 📋 21. TABLE `InventoryLine` (sous-structure)

| Champ | Type | Description |
|-------|------|-------------|
| `articleId` | `string` | Article |
| `articleName` | `string` | Nom |
| `theoreticalQty` | `number` | Qté théorique |
| `countedQty` | `number \| null` | Qté comptée |
| `difference` | `number` | Écart |

---

## 📋 22. TABLE `patientJourney` (parcours patient)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant |
| `patientId` | `string` | FK → patients.id |
| `timestamp` | `string (ISO)` | Horodatage |
| `department` | `JourneyDepartment` | Service |
| `action` | `string` | Action |
| `status` | `string?` | Statut résultant |
| `details` | `string?` | Détails |
| `actorId` | `string?` | Acteur |
| `actorName` | `string?` | Nom acteur |
| `consultationId` | `string?` | FK consultation |
| `invoiceId` | `string?` | FK facture |
| `labRequestId` | `string?` | FK analyse |
| `hospitalizationId` | `string?` | FK hospitalisation |

---

## 📋 23. TABLE `users`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string` | Identifiant |
| `name` | `string` | Nom |
| `role` | `'receptionist' \| 'doctor' \| 'cashier' \| 'pharmacy' \| 'magasinier' \| 'laboratory' \| 'admin'` | Rôle |
| `password` | `string?` | Mot de passe |

---

## 📋 24. TABLE `warehouseServices` (services d'entrepôt)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string` | Identifiant |
| `code` | `string` | Code |
| `name` | `string` | Nom |
| `kind` | `'pharmacie' \| 'service'` | Type |
| `color` | `string` | Couleur |
| `active` | `boolean` | Actif ? |
| `createdAt` | `string (ISO)` | Création |

---

## 📋 25. TABLES AUXILIAIRES

### `fournisseurs`
| Champ | Type |
|-------|------|
| `id`, `name`, `contactPerson?`, `phone?`, `email?`, `address?`, `nif?`, `stat?`, `notes?`, `createdAt?` | |

### `familles`
| Champ | Type |
|-------|------|
| `id`, `code`, `name`, `color`, `order?` | |

### `companies`
| Champ | Type |
|-------|------|
| `id`, `name` | |

### `messages`
| Champ | Type |
|-------|------|
| `id`, `fromUserId`, `fromUserName`, `toUserId`, `toUserName`, `content`, `timestamp`, `read` | |

### `auditLogs`
| Champ | Type |
|-------|------|
| `id`, `timestamp`, `userId`, `userName`, `userRole`, `action`, `details`, `patientId?` | |

### `notifications`
| Champ | Type |
|-------|------|
| `id`, `targetRole`, `targetUserId?`, `message`, `type`, `timestamp`, `read` | |

### `ticketSettings` (configuration)
| Champ | Type |
|-------|------|
| `facilityName`, `address`, `phone`, `nif`, `email?`, `website?`, `logoUrl`, `receiptTitle`, `footerMessage`, `paperWidth`, `autoPrint`, `showLogo`, `showBarcode`, `showSignature`, `copies`, `currency`, `paymentMethods`, `invoicePrefix`, `ticketFooter2?`, `ticketHeaderColor?` | |

---

## 🔗 RELATIONS CLÉS

```
patients ──1:N──> consultations
patients ──1:N──> invoices
patients ──1:N──> labRequests
patients ──1:N──> patientJourney
patients ──1:N──> HbRecord

consultations ──1:N──> Prescription
consultations ──1:N──> LabRequest
consultations ──1:N──> EchoRequest

articles ──1:N──> StockTransfer
articles ──1:N──> StockEntry
articles ──1:N──> StockMovement
articles ──1:N──> MovementLine

invoices ──1:N──> InvoiceItem
invoices ──N:1──> cashClosings (closingId)

HbRecord ──1:N──> HbLine
HbRecord ──1:N──> Payment (partiel)

movementHeaders ──1:N──> movementLines

warehouseServices ──1:N──> serviceStocks (articles)
```

---

## 📝 MODIFICATION — DATE D'ACTE / DE SORTIE DANS LA SAISIE SAGE

### Besoin fonctionnel
Dans **Prescription (Saisie Sage)**, pour les onglets **Hospitalisation** et **Bloc**, la date est affichée immédiatement **après le montant**. Elle permet de distinguer :

- la **date de sortie de marchandise** ;
- ou la **date de l'acte / de sortie**.

Le montant reste le montant calculé de la ligne : `prix unitaire × quantité − remise`.

### Donnée concernée : `HbLine`

`HbLine` est une ligne saisie dans le module de caisse pour un dossier d'hospitalisation ou de bloc. Elle est actuellement définie dans `src/components/CashierModule.tsx` (état local du module) :

| Champ | Type | Rôle |
|---|---|---|
| `id` | `string` | Identifiant de la ligne |
| `articleName` | `string` | Article ou prestation |
| `quantity` | `number` | Quantité |
| `unitPrice` | `number` | Prix unitaire |
| `discount` | `number` | Remise en pourcentage |
| `dateSort` | `string?` (`YYYY-MM-DD`) | Date d'acte / date de sortie |

### Fonctionnement du code

1. **Initialisation** : une nouvelle ligne reçoit par défaut la date du jour dans `dateSort`.
2. **Saisie** : le champ HTML `type="date"` est placé après **Montant**.
3. **Enregistrement** : `hbArtSave()` reprend la date saisie ; elle n'est plus remplacée automatiquement par la date du jour.
4. **Modification** : cliquer sur une ligne recharge sa date dans le formulaire, ce qui permet de la corriger.
5. **Affichage** : la colonne **Date d'acte / de sortie** est également visible après **Montant** dans le tableau.

> **Important :** `dateSort` est une date métier saisie par l'utilisateur. Il ne faut pas la confondre avec `createdAt`, qui indique la date technique de création d'un enregistrement.

---

## 📋 26. TABLE `ventes` — VENTES UNIFIÉES (tous types)

> **Principe :** quelle que soit la finalité — **consultation, hospitalisation, bloc opératoire, pharmacie, laboratoire, échographie, vente externe** — la finalité est une **vente**. Toutes les sorties facturées convergent désormais dans cette table unique.
>
> Les anciennes tables `invoices` et `hbRecords` sont **conservées pour la compatibilité** des modules existants. Une migration idempotente (`migrateLegacyToVentes`) s'exécute automatiquement au démarrage pour dupliquer les données historiques dans `ventes`. Les nouveaux développements doivent utiliser `ventes` / `venteLines` comme source de vérité.

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `patientId` | `string?` | FK → patients.id (vide pour les externes) |
| `consultationId` | `string?` | FK → consultations.id |
| `numeroFacture` | `string` | Numéro de facture (ex: FAC-2026-0001), unique |
| `type` | `'consultation' \| 'hospitalisation' \| 'bloc' \| 'pharmacie' \| 'labo' \| 'echo' \| 'externe'` | Nature de la vente |
| `clientType` | `ClientType` | Type de client (comptoir / societe / externe) |
| `clientName` | `string?` | Nom du client |
| `company` | `string?` | Société (si clientType = 'societe') |
| `subCompany` | `string?` | Sous-entité |
| `subtotal` | `number` | Sous-total avant remise |
| `remisePct` | `number?` | Remise globale (%) |
| `remiseMontant` | `number?` | Montant total de remise (lignes + globale) |
| `montantFacture` | `number` | Montant TTC final |
| `montantPaye` | `number` | Montant déjà encaissé |
| `status` | `'pending' \| 'partiel' \| 'paid' \| 'annule'` | Statut de règlement |
| `isExterne` | `boolean` | Vente externe sans dossier patient ? |
| `source` | `'caisse' \| 'pharmacie' \| 'urgence' \| 'magasin' \| 'admin'` | Service ayant saisi la vente |
| `dateVente` | `string (ISO)` | Date de la vente / de l'acte |
| `datePaiement` | `string?` | Date du premier paiement |
| `paidAt` | `string?` | Date de paiement intégral |
| `cancelledAt` | `string?` | Date d'annulation |
| `cancelReason` | `string?` | Motif d'annulation |
| `createdBy` | `string?` | ID utilisateur créateur |
| `createdByName` | `string?` | Nom créateur |
| `paidBy` | `string?` | ID utilisateur encaissement |
| `paidByName` | `string?` | Nom encaissement |
| `createdAt` | `string (ISO)` | Date de création technique |
| `notes` | `string?` | Notes libres |
| `closingId` | `string?` | FK → cashClosings.id |
| `legacyInvoiceId` | `string?` | FK → invoices.id (migration) |
| `legacyHbRecordId` | `string?` | FK → hbRecords.id (migration) |

---

## 📋 27. TABLE `venteLines` — LIGNES DE VENTE

> La structure des lignes est **normalisée** : une ligne = un article/prestation avec sa quantité, son prix unitaire, sa remise et sa date d'acte/sortie (`dateSort`) — cette dernière est **conservée pour l'historique**, y compris pour l'hospitalisation / bloc.

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `venteId` | `string` | FK → ventes.id |
| `articleId` | `string?` | FK → articles.id (si catalogue) |
| `articleName` | `string` | Nom article / prestation |
| `quantity` | `number` | Quantité |
| `unitPrice` | `number` | Prix unitaire |
| `discount` | `number` | Remise % |
| `category` | `'consultation' \| 'lab' \| 'pharmacy' \| 'surgery' \| 'hospitalization' \| 'echo' \| 'bloc' \| 'externe'?` | Catégorie (états statistiques) |
| `dateSort` | `string?` | 📅 **Date d'acte / de sortie** — conservée pour l'historique |

---

## 📋 28. TABLE `ventePayments` — PAIEMENTS RATTACHÉS AUX VENTES

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Identifiant unique |
| `venteId` | `string` | FK → ventes.id |
| `amount` | `number` | Montant versé |
| `method` | `PaymentMethod` | Mode de paiement (Espèces, Carte, Mobile Money, Virement, Chèque…) |
| `date` | `string (ISO)` | Date du paiement |
| `paidBy` | `string` | Nom opérateur |
| `paidByUserId` | `string?` | FK → users.id |
| `reference` | `string?` | Référence (n° chèque, transaction…) |

---

## 🔧 HELPERS DISPONIBLES (`src/store.ts`)

| Helper | Rôle |
|--------|------|
| `createVente(state, data, lines)` | Crée une vente + ses lignes, calcule les totaux, incrémente le compteur de facture, génère `numeroFacture` |
| `addVentePayment(state, venteId, pay)` | Enregistre un paiement (partiel ou complet), met à jour `status` / `montantPaye` / `paidAt` |
| `getVenteLines(state, venteId)` | Récupère les lignes d'une vente |
| `getVentePayments(state, venteId)` | Récupère les paiements d'une vente |
| `computeVenteTotals(lines, remisePct)` | Calcule `subtotal`, `remiseMontant`, `montantFacture` |
| `ligneVenteNet(line)` | Montant net d'une ligne après remise |
| `migrateLegacyToVentes(state)` | Migre les anciennes `invoices` + `hbRecords` vers `ventes` / `venteLines` / `ventePayments` (idempotente) |
| `generateFactureNumber(prefix, counter)` | Génère un numéro `FAC-YYYY-NNNN` |

---

## 🔗 RELATIONS CLÉS (mises à jour)

```
patients ──1:N──> ventes
consultations ──1:N──> ventes
ventes ──1:N──> venteLines
ventes ──1:N──> ventePayments
ventes ──N:1──> cashClosings (closingId)
ventes ──N:1──> users (createdBy, paidBy)
```

### Points à modifier plus tard (anciens modules)

- Pour basculer un module de `invoices` vers `ventes`, remplacer les accès `state.invoices` par `state.ventes` et utiliser `createVente` / `addVentePayment`.
- Lorsqu'un module crée une vente, il lui est recommandé d'écrire en double dans `invoices` le temps de la migration complète (ou d'utiliser le helper `createVente` et de conserver une référence croisée via `legacyInvoiceId`).
- `dateSort` reste une date métier saisie par l'utilisateur. Il ne faut pas la confondre avec `createdAt` (date technique de création).

---

## 📝 CORRECTIONS ET AMÉLIORATIONS RÉCENTES (v4.0 — Juillet 2026)

### Correction critique : type `JSX.Element` introuvable dans ModuleFacturationSocietes

Le tableau `TABS` dans `ModuleFacturationSocietes.tsx` était typé comme `[Tab, string, JSX.Element][]` alors que :
1. Le namespace `JSX` n'est pas accessible avec `"jsx": "react-jsx"` dans `tsconfig.json` (React 19)
2. Le second élément est un `React.ReactNode` (balise JSX `<span>`) et non une `string`
3. Le troisième élément (`undefined`) n'est jamais utilisé dans le destructuring `([k, label])`

**Correction** : le type a été changé en `[Tab, React.ReactNode][]` et les troisièmes éléments superflus ont été supprimés.

### Nettoyage des imports et variables inutilisées

Plusieurs imports et variables inutilisées ont été supprimés pour correspondre aux règles `noUnusedLocals` et `noUnusedParameters` du `tsconfig.json` :

| Fichier | Variable supprimée | Raison |
|---------|-------------------|--------|
| `ModuleFacturationSocietes.tsx` | `addCompanyBillingPayment`, `Company`, `settlementModeLabel` | Importés/déclarés mais jamais utilisés |
| `ModuleFacturationSocietes.tsx` | 3e élément `undefined` des tuples `TABS` | Jamais exploité |

### Corrections antérieures (rappel)

#### Correction critique : bouton « Valider » du médecin

Les appels à `setShowHistory(false)` dans `ModuleMedecin.tsx` (fonctions `submitConsultation` et `handleBackToQueue`) provoquaient un `ReferenceError` car la variable d'état `showHistory` n'a jamais été déclarée. Les deux appels ont été supprimés.

### Déduplication des analyses dans le dossier médical

Dans `ModuleDossierMedical.tsx`, les analyses labo apparaissaient en double car elles existent à la fois dans `consultations[].labRequests` et dans `state.labRequests`. Un mécanisme de déduplication par ID (`seenLrIds: Set<string>`) a été ajouté.

### Ticket d'encaissement Hospit/Bloc simplifié

Le ticket imprimé lors d'un paiement hospit/bloc affiche désormais uniquement :
1. **Montant Total** de la facture (`montantFacture`)
2. **Somme déjà perçue** (`montantPaye`)
3. **Paiement actuel** (montant du versement en cours)
4. **Reste à payer** (`venteRestantDu`)

Auparavant, le ticket imprimait toutes les lignes d'articles (détail complet).

### Barre de recherche dans les onglets Hospit et Bloc

Une barre de recherche a été ajoutée en haut des onglets Hospitalisation et Bloc Opératoire dans le module Caisse. Elle filtre les dossiers par :
- Nom du patient (`clientName`)
- Numéro de dossier / matricule
- Numéro de facture (`numeroFacture`)
- Société (`company`)

### Fond rouge pour les clients comptoir impayés

Dans la liste des dossiers hospit/bloc, les patients de type **comptoir** dont le reste à payer est supérieur à 0 sont affichés avec :
- Bordure rouge (`border-red-300`)
- Fond rouge clair (`bg-red-50`)

Cela permet au caissier d'identifier visuellement les dossiers non soldés en un coup d'œil.

### Demandes d'échographie

Le médecin peut désormais saisir des demandes d'échographie en plus des demandes d'analyses labo. Les échos sont :
- Saisies dans la consultation (recherche dans le catalogue `ECHO_CATALOG`)
- Facturées en caisse comme les analyses labo
- Imprimées sur un bon d'échographie dédié après paiement

### Module Dossier Médical

Le dossier médical (`ModuleDossierMedical.tsx`) affiche l'historique complet d'un patient :
- Consultations avec détails (diagnostic, prescriptions, labo, écho)
- Analyses avec résultats et valeurs usuelles
- Factures avec statut (payée / en attente)
- Impression du dossier complet en A4

---

## 26. Démonstration synthétique déterministe et crédit société

`src/data/massiveDemoData.ts` est la seule source du jeu de démonstration initial. Il utilise une graine fixe et des IDs déterministes; aucune donnée personnelle réelle n'est intégrée. Les couples `patients.lastName + patients.firstName`, les dossiers (`DOS-…`), matricules et numéros de facture sont uniques. Les données sont distribuées entre le 21/07/2024 et le 21/07/2026.

### Facturation société / crédit

| Structure | Relations et rôle |
|---|---|
| `companies` | `paymentMode = Crédit` obligatoire; `settlementMode` vaut `monthly_global` ou `per_invoice`. |
| `patients.company` | FK logique vers une société pour un salarié conventionné; `matricule` identifie le salarié fictif. |
| `invoices` / `ventes` | Référencent le patient, la consultation et, pour le crédit, la société. |
| `companyBillingAccounts` | Relevé mensuel : `company`, `month`, `invoiceIds`, totaux, solde et statut. |
| `CompanyBillingPayment` | Règlement d'un relevé global mensuel, avec mode, référence, date et factures concernées. |
| `ventePayments` | Règlements individuels/partiels des ventes ou factures. |

Les tableaux de l'interface doivent appliquer recherche, filtres de date et pagination/limitation avant d'afficher ce volume de démonstration.
