export type UserRole = 'receptionist' | 'doctor' | 'cashier' | 'pharmacy' | 'magasinier' | 'laboratory' | 'admin' | 'billing';
export type ClientType = 'comptoir' | 'societe' | 'externe';
export type ArticleFamily = 'MEDIC' | 'LABO' | 'DENT' | 'ECHO' | 'CONSULT' | 'HOSPIT' | 'BLOC';
export type PatientStatus = 'registered' | 'waiting_consultation' | 'in_consultation' | 'consulted_awaiting_payment' | 'invoice_paid' | 'medications_delivered' | 'analyses_pending' | 'analyses_complete' | 'completed';

export interface User { id: string; name: string; role: UserRole; password?: string; }

export interface TicketSettings {
  facilityName: string; address: string; phone: string; nif: string;
  email?: string; website?: string;
  logoUrl: string; receiptTitle: string; footerMessage: string;
  paperWidth: 58 | 80; autoPrint: boolean;
  showLogo: boolean;
  showBarcode: boolean;
  showSignature: boolean;
  copies: number; // nombre d'exemplaires à imprimer
  currency: 'Ar' | '€' | '$' | 'Fc';
  paymentMethods: string[]; // ex: Espèces, Carte, Mobile Money, Virement, Chèque
  invoicePrefix: string; // préfixe des numéros de facture
  ticketFooter2?: string; // 2e ligne d'en-tête (ex: "Service des urgences")
  ticketHeaderColor?: string; // couleur d'accent (hex) — utilisée dans la prévisualisation seulement
}

export interface VitalSigns {
  temperature: string; bloodPressureSystolic: string; bloodPressureDiastolic: string;
  heartRate: string; oxygenSaturation: string; weight: string; height: string; tdr?: string;
}

export interface Patient {
  id: string; dossier: string; matricule?: string; firstName: string; lastName: string;
  dateOfBirth: string; age: string; gender: 'M' | 'F'; address: string; contact: string; ssn: string;
  insureName?: string; clientType: ClientType; company?: string; subCompany?: string;
  allergies: string[]; chronicTreatments: string[]; antecedents: string[];
  bloodGroup?: string; vitalSigns?: VitalSigns;
  registeredAt: string; registeredBy: string; status: PatientStatus;
  lastVisitAt?: string;
  assignedDoctor?: string; assignedSpecialty?: string; blacklisted?: boolean;
  blacklistReason?: string; blacklistDate?: string;
}

export interface Article {
  id: string; name: string; family: ArticleFamily; unit: string; barcode?: string;
  priceComptoir: number; priceSociete: number; priceExterne: number;
  purchasePrice: number; // prix d'achat
  stockCentral: number; stockPharmacie: number;
  /** Stock d'alerte (seuil) par dépôt — en dessous, l'article est signalé "stock bas" */
  minStockCentral: number; minStockPharmacie: number;
  /** Désactive les alertes de stock (bas / rupture) pour le dépôt central */
  alertDisabledCentral?: boolean;
  /** Désactive les alertes de stock (bas / rupture) pour la pharmacie */
  alertDisabledPharmacie?: boolean;
  /** Stocks par service (hors pharmacie) — clé = WarehouseService.id */
  serviceStocks?: Record<string, number>;
  /** Seuils mini par service */
  serviceMinStocks?: Record<string, number>;
  expiryDate?: string; // date péremption
  supplier?: string;
  /** Blocage vente pharmacie (réservé / en attente régularisation / rupture forcée) */
  saleBlocked?: boolean;
  saleBlockReason?: string;
  saleBlockedAt?: string;
  saleBlockedBy?: string;
  /* ====== Champs spécifiques aux examens / prestations (labo, écho, consult, hospit, bloc) ====== */
  /** Code examen (ex: BIO001, ECH001). Utilisé pour les prestations. */
  code?: string;
  /** Paramètres / descripteurs (ex: ['Glucose', 'Urée'] pour un bilan). */
  parameters?: string[];
  /** Type de prélèvement (ex: 'Sang veineux', 'Urine'). */
  sampleType?: string;
  /** Prix urgence (pour les examens labo/écho). */
  urgentPrice?: number;
  /** Durée / délai de rendu en heures. */
  durationHours?: number;
  /** Urgence par défaut. */
  defaultUrgent?: boolean;
  /** Catégorie métier (ex: 'hematologie', 'biochimie'…). */
  labCategory?: string;
}

export interface LabResult {
  parameter: string; value: number; unit: string;
  normalMin: number; normalMax: number; isAbnormal: boolean;
}

/* ====== LABORATOIRE — demandes autonomes ====== */
export type LabCategory =
  | 'hematologie' | 'biochimie' | 'serologie' | 'bacteriologie'
  | 'parasitologie' | 'immunologie' | 'hemostase' | 'autre';

/** @deprecated — Les examens de laboratoire sont désormais des Article (family: 'LABO').
 *  Alias conservé pour compatibilité — un LabExamCatalog est un Article. */
export type LabExamCatalog = Article;

/** Demande d'analyse — peut être liée à une consultation OU autonome (state.labRequests). */
export interface LabRequest {
  id: string;
  patientId?: string;
  consultationId?: string;
  examType: string;
  code?: string;
  category?: LabCategory;
  parameters: string[];
  urgent: boolean;
  status: 'pending' | 'paid' | 'sample_received' | 'in_progress' | 'completed';
  sampleType?: string;
  sampleReceived?: boolean;
  sampleReceivedAt?: string;
  requestedBy?: string;       // id du demandeur
  requestedAt?: string;
  invoiceId?: string;         // facture liée (pour les demandes autonomes)
  price?: number;
  results?: LabResult[];
  completedAt?: string;
  completedBy?: string;
  validatedBy?: string;
}

/* ====== PARCOURS PATIENT (timeline) ====== */
export type JourneyDepartment =
  | 'reception' | 'consultation' | 'laboratoire' | 'pharmacie'
  | 'caisse' | 'hospitalisation' | 'bloc' | 'imagerie' | 'administration';

export interface PatientJourneyEvent {
  id: string;
  patientId: string;
  timestamp: string;
  department: JourneyDepartment;
  action: string;             // ex: "Admis en consultation"
  status?: string;            // PatientStatus visé
  details?: string;
  actorId?: string;
  actorName?: string;
  consultationId?: string;
  invoiceId?: string;
  labRequestId?: string;
  hospitalizationId?: string;
}

export interface Consultation {
  id: string; patientId: string; doctorId: string; doctorName: string; date: string;
  vitalSigns: VitalSigns; visitReason: string; diagnosis: string; notes: string;
  prescriptions: VenteLine[]; labRequests: LabRequest[];
  echoRequests?: EchoRequest[];
  hospitalizeRequested: boolean; surgeryRequested: boolean; isEmergency: boolean;
}

export interface InvoiceItem { description: string; amount: number; category: 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization' | 'echo'; }

/** Demande d'échographie saisie par le médecin */
export interface EchoRequest {
  id: string;
  patientId?: string;
  consultationId?: string;
  examType: string;          // ex: Écho abdominale, Écho pelvienne...
  notes?: string;
  urgent: boolean;
  status: 'pending' | 'paid' | 'completed';
  requestedBy?: string;
  requestedAt?: string;
  invoiceId?: string;
  price?: number;
  completedAt?: string;
}

export interface Invoice {
  id: string; patientId?: string; consultationId?: string; clientName?: string;
  clientType: ClientType; items: InvoiceItem[]; totalAmount: number;
  patientCharge: number; status: 'pending' | 'paid';
  paidAt?: string; paidBy?: string; createdAt: string; isExternal: boolean;
  /** Identifiant de la clôture Z ayant intégré cette facture. */
  closingId?: string;
}

/** Instantané de clôture de caisse. Les montants sont figés pour permettre la réimpression. */
export interface CashClosing {
  id: string; date: string; cashierId: string; cashierName: string;
  invoiceIds: string[]; invoiceCount: number;
  consultationTotal: number; externalTotal: number; hospitalizationTotal: number;
  grandTotal: number; createdAt: string;
}

/** Ligne individuelle de livraison de pharmacie (après validation d'une ordonnance ou vente). */
export interface PharmaDeliveryItem {
  id: string;
  consultationId: string;
  patientId?: string;
  patientName: string;
  doctorName?: string;
  articleId?: string;
  articleName: string;
  quantity: number;
  unitPrice: number;
  posology?: string;
  deliveredAt: string;
  deliveredByUserId: string;
  deliveredByName: string;
  closingId?: string;
  isExternal?: boolean;
}

/** Base compilée des livraisons de pharmacie lors de la clôture de caisse / garde du responsable. */
export interface PharmaDeliveryClosing {
  id: string;
  closingNumber: string; // ex: LIV-PHARMA-2026-0001
  date: string;
  responsibleId: string;
  responsibleName: string;
  deliveryIds: string[];
  totalItems: number;
  totalAmount: number;
  deliveries: PharmaDeliveryItem[];
  createdAt: string;
  notes?: string;
}

export type TransferCategory = 'central' | 'hospitalisation' | 'bloc' | 'approvisionnement';

/** Service destinataire du dépôt (pharmacie, bloc, soins, etc.) — extensible */
export interface WarehouseService {
  id: string;
  code: string;
  name: string;
  /** 'pharmacie' utilise stockPharmacie ; les autres utilisent serviceStocks[id] */
  kind: 'pharmacie' | 'service';
  color: string;
  active: boolean;
  createdAt: string;
}

export type StockMovementType = 'entry' | 'exit' | 'transfer' | 'inventory_adjust';
export type StockLocation = 'central' | 'pharmacie' | string; // string = service id

/** Mouvement unifié entrée / sortie / transfert / inventaire */
export interface StockMovement {
  id: string;
  type: StockMovementType;
  articleId: string;
  articleName: string;
  quantity: number;
  fromLocation: StockLocation;
  toLocation: StockLocation;
  reason?: string;
  ref?: string;
  date: string;
  userId: string;
  userName?: string;
  serviceId?: string;
  serviceName?: string;
}

export interface InventoryLine {
  articleId: string;
  articleName: string;




  theoreticalQty: number;
  countedQty: number | null;
  difference: number;
}

export interface InventorySession {
  id: string;
  location: StockLocation;
  locationLabel: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  startedBy: string;
  startedByName?: string;
  lines: InventoryLine[];
  notes?: string;
}

export interface StockTransfer {
  id: string; articleId: string; articleName: string; quantity: number;
  category: TransferCategory;
  purchasePrice?: number;
  expiryDate?: string;
  supplier?: string;
  invoiceRef?: string;
  requestedBy?: string; requestedAt?: string; transferredBy?: string; transferredAt?: string;
  status: 'requested' | 'transferred' | 'cancelled'; notes?: string;
  /** Service destinataire (pharmacie, bloc, soins…) */
  targetServiceId?: string;
  targetServiceName?: string;
  /** Origine de la demande */
  requestSource?: 'pharmacy' | 'hospitalisation' | 'magasinier' | 'other';
}

export interface StockEntry {
  id: string; articleId: string; articleName: string; quantity: number;
  purchasePrice: number; supplier: string; invoiceRef: string;
  expiryDate?: string; date: string; enteredBy: string;
  category?: 'central' | 'hospitalisation' | 'bloc' | 'approvisionnement';
  /** Toujours dépôt central pour les achats centralisés */
  destination?: 'central';
}

export interface Message {
  id: string; fromUserId: string; fromUserName: string;
  toUserId: string; toUserName: string; content: string;
  timestamp: string; read: boolean;
}

export interface AuditLog { id: string; timestamp: string; userId: string; userName: string; userRole: UserRole; action: string; details: string; patientId?: string; }
export interface Notification { id: string; targetRole: UserRole; targetUserId?: string; message: string; type: 'info' | 'warning' | 'critical'; timestamp: string; read: boolean; }
export interface Fournisseur {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  nif?: string;
  stat?: string;
  notes?: string;
  createdAt?: string;
}

export interface Famille {
  id: string;
  code: string;
  name: string;
  color: string;
  order?: number;
}

/** Sous-mode de règlement des factures société */
export type CompanySettlementMode = 'monthly_global' | 'per_invoice';

export interface Company {
  id: string;
  name: string;
  /** Mode général : les sociétés sont systématiquement en Crédit. */
  paymentMode: 'Crédit';
  /** Sous-mode : règlement global mensuel ou individuel par facture */
  settlementMode: CompanySettlementMode;
  notes?: string;
  createdAt?: string;
}

/** Compte de facturation mensuel d'une société. Il consolide les factures du mois
 * afin de suivre le solde dû et les règlements de chaque client conventionné.
 * Ce regroupement est utilisé pour le sous-mode `monthly_global`. */
export interface CompanyBillingAccount {
  id: string;
  company: string;
  month: string; // YYYY-MM
  invoiceIds: string[];
  totalAmount: number;
  paidAmount: number;
  status: 'open' | 'partial' | 'paid';
  createdAt: string;
  /** Montant versé via l'action « Régler toutes les factures du mois » (=solde lors de la validation) */
  finalSettlementAmount?: number;
  finalSettlementDate?: string;
  finalSettlementMethod?: string;
  finalSettlementReference?: string;
  finalSettlementObservation?: string;
  settledBy?: string;         // user id responsable facturation
  settledByName?: string;
  payments: CompanyBillingPayment[];
}

export interface CompanyBillingPayment {
  id: string;
  amount: number;
  date: string;
  method?: string;
  reference?: string;
  observation?: string;
  /** Liste des factures (ids) réglées par ce règlement (utile en individuel) */
  invoiceIds?: string[];
  receivedBy?: string;       // nom
  receivedByUserId?: string; // id user
}

/* ====== MOUVEMENTS AVEC EN-TÊTE + LIGNES (pour interface propre) ====== */
export type MovementType = 'achat' | 'vente' | 'transfert' | 'inventaire' | 'sortie';

export interface MovementHeader {
  id: string;
  type: MovementType;
  ref?: string;               // N° BL, N° Facture, N° Transfert, etc.
  date: string;
  userId: string;
  userName?: string;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  totalQuantity?: number;
  notes?: string;
  status?: 'completed' | 'cancelled';
}

export interface MovementLine {
  id: string;
  movementId: string;
  articleId: string;
  articleName: string;
  quantity: number;
  unitPrice?: number;
  purchasePrice?: number;
  reason?: string;
}

/* ====== HOSPITALISATION / BLOC (paiement partiel, saisie unifiée) ====== */
/** @deprecated — Utiliser VenteLine directement. Alias conservé pour compatibilité. */
export type HbLine = VenteLine;

/** Dossier Hospitalisation ou Bloc Opératoire — partagé entre Caisse et Pharmacie
 *  (caisse de garde), car seul le paiement fait foi : qui saisit n'a pas d'importance. */
export interface HbRecord {
  id: string;
  patientId?: string;
  patientName: string;
  clientType: ClientType;
  company?: string;
  type: 'hospit' | 'bloc';
  lines: VenteLine[];
  payments: { amount: number; paidBy: string; date: string; paidByUserId?: string; receivedBy?: 'caisse' | 'pharmacie' }[];
  /** Date d'ouverture du dossier. */
  openedAt?: string;
  /** Qui a ouvert le dossier (caisse / pharmacie de garde). */
  openedBy?: string;
  openedByUserId?: string;
}

/* ==========================================================================
 * TABLE UNIFIÉE DES VENTES — `ventes` + `venteLines`
 * --------------------------------------------------------------------------
 * Toute sortie de marchandise ou prestation facturée — consultation,
 * hospitalisation, bloc opératoire, pharmacie, laboratoire, échographie,
 * vente externe — aboutit à UNE VENTE. Les anciennes tables `invoices`
 * et `hbRecords` continuent d'exister pour la compatibilité ; elles
 * peuvent être migrées/dupliquées vers `ventes` via `migrateLegacyToVentes`.
 * ========================================================================== */

/** Origine / nature de la vente (permet de filtrer les rapports). */
export type VenteType =
  | 'consultation'   // acte de consultation
  | 'hospitalisation'
  | 'bloc'
  | 'pharmacie'      // délivrance ordonnance / vente comptoir
  | 'labo'           // analyse laboratoire
  | 'echo'           // échographie / imagerie
  | 'externe';       // vente externe sans dossier patient

/** Source fonctionnelle de saisie de la vente. */
export type VenteSource = 'caisse' | 'pharmacie' | 'urgence' | 'magasin' | 'admin';

/** Statut de règlement de la vente. */
export type VenteStatus = 'pending' | 'partiel' | 'paid' | 'annule';

/** Mode de règlement utilisé pour un paiement. */
export type PaymentMethod = 'Espèces' | 'Carte bancaire' | 'Mobile Money' | 'Virement' | 'Chèque' | 'Autre';

/** Ligne de vente unifiée — regroupe en une seule structure :
 *  - les lignes de prescription (ordonnances médecin)
 *  - les lignes hospitalisation / bloc
 *  - les lignes de vente (caisse / pharmacie / externe)
 *  Tous les contextes utilisent la même table de lignes. */
export interface VenteLine {
  /** Identifiant unique de la ligne (UUID). */
  id: string;
  /** FK → ventes.id (vide pour les prescriptions et lignes hospitat/bloc non encore facturées). */
  venteId?: string;
  /** Nom de l'article / prestation. */
  articleName: string;
  /** Référence optionnelle vers le catalogue articles. */
  articleId?: string;
  /** Quantité. */
  quantity: number;
  /** Prix unitaire (avant remise). */
  unitPrice: number;
  /** Remise % sur la ligne. */
  discount: number;
  /** Catégorie (pour les états : pharmacie / labo / hospit…). */
  category?: 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization' | 'echo' | 'bloc' | 'externe';
  /** 📅 Date d'acte / de sortie — conservée pour l'historique. */
  dateSort?: string;
  /* ====== Champs prescription (ordonnance) ====== */
  /** Posologie (ex: "1 comprimé matin et soir"). */
  posology?: string;
  /** Durée du traitement. */
  duration?: string;
  /** Instructions supplémentaires. */
  instructions?: string;
  /** Marque de délivrance pharmacie. */
  delivered?: boolean;
}

/** @deprecated — Utiliser VenteLine directement. Alias conservé pour compatibilité. */
export type Prescription = VenteLine;

/** En-tête de vente — regroupe consultation, bloc, hospitalisation, pharmacie, externe. */
export interface Vente {
  /** Identifiant unique (UUID). */
  id: string;
  /** FK → patients.id (vide pour ventes externes sans dossier). */
  patientId?: string;
  /** FK → consultations.id (si la vente est rattachée à une consultation). */
  consultationId?: string;
  /** Numéro de facture (ex: FAC-2026-0001). Unique. */
  numeroFacture: string;
  /** Nature de la vente. */
  type: VenteType;
  /** Type de client (comptoir / societe / externe) — détermine la grille de prix. */
  clientType: ClientType;
  /** Nom du client (renseigné pour externes ou société). */
  clientName?: string;
  /** Société (pour clientType = 'societe'). */
  company?: string;
  /** Sous-entité / projet. */
  subCompany?: string;
  /** Sous-total HT/lignes (somme de quantité×prixUnitaire avant remise). */
  subtotal: number;
  /** Remise globale en pourcentage (appliquée sur le sous-total). */
  remisePct?: number;
  /** Montant de remise global (calculé ou saisi). */
  remiseMontant?: number;
  /** Montant TTC / final de la facture (après remise). */
  montantFacture: number;
  /** Montant total déjà encaissé (0 si pending, =montantFacture si paid). */
  montantPaye: number;
  /** Statut de règlement. */
  status: VenteStatus;
  /** Vente externe (sans dossier patient lié) ? */
  isExterne: boolean;
  /** Source de saisie. */
  source: VenteSource;
  /** Date de la vente / de l'acte. */
  dateVente: string;
  /** Date du premier paiement. */
  datePaiement?: string;
  /** Date de paiement intégral. */
  paidAt?: string;
  /** Date d'annulation éventuelle. */
  cancelledAt?: string;
  /** Motif d'annulation. */
  cancelReason?: string;
  /** Utilisateur ayant créé la vente. */
  createdBy?: string;
  createdByName?: string;
  /** Utilisateur ayant finalisé le paiement. */
  paidBy?: string;
  paidByName?: string;
  /** Date de création technique. */
  createdAt: string;
  /** Notes libres. */
  notes?: string;
  /** FK → cashClosings.id (lorsque la vente est clôturée en Z). */
  closingId?: string;
  /** Références vers les anciennes tables pour la migration. */
  legacyInvoiceId?: string;
  legacyHbRecordId?: string;
}

/** Paiement partiel rattaché à une vente (utile pour hospit/bloc). */
export interface VentePayment {
  id: string;
  venteId: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  paidBy: string;           // nom
  paidByUserId?: string;    // id user
  reference?: string;       // n° chèque, transaction mobile money…
}
