# 📊 CONSTITUTION DE LA BASE DE DONNÉES — RECEPTION SALFA

> **Date :** 20 Juillet 2026  
> **Projet :** MediCare HIS v2.0 — Gestion de clinique / centre de santé

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
| `minStockCentral` | `number` | Seuil mini central |
| `minStockPharmacie` | `number` | Seuil mini pharmacie |
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

## 📝 NOTE SUR LA DATE D'ACTE / SORTIE

> **La date de sortie (`dateSort`) est conservée dans la table `HbLine`** (lignes de vente hospitalisation/bloc) car elle constitue **l'historique de sortie du malade**.
> Elle a été retirée de l'interface de saisie (prescription bloc et hospitalisation) pour simplifier la saisie, mais elle reste en base pour la traçabilité.
