export type UserRole = 'receptionist' | 'doctor' | 'cashier' | 'pharmacy' | 'magasinier' | 'laboratory' | 'admin';
export type ClientType = 'comptoir' | 'societe' | 'externe';
export type ArticleFamily = 'MEDIC' | 'LABO' | 'DENT' | 'ECHO';
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
}

export interface Prescription {
  id: string; articleId: string; articleName: string; quantity: number;
  posology: string; duration: string; instructions: string;
  unitPrice: number; discount: number; // remise % par ligne
  delivered: boolean;
}

export interface LabResult {
  parameter: string; value: number; unit: string;
  normalMin: number; normalMax: number; isAbnormal: boolean;
}

/* ====== LABORATOIRE — catalogue & demandes autonomes ====== */
export type LabCategory =
  | 'hematologie' | 'biochimie' | 'serologie' | 'bacteriologie'
  | 'parasitologie' | 'immunologie' | 'hemostase' | 'autre';

/** Un examen du catalogue laboratoire (avec grille tarifaire). */
export interface LabExamCatalog {
  id: string;
  code: string;
  name: string;
  category: LabCategory;
  parameters: string[];
  sampleType: string;        // Sang veineux, Urines, Selles, Sérum...
  priceComptoir: number;
  priceSociete: number;
  priceExterne: number;
  urgentPrice: number;
  durationHours: number;     // délai de rendu (heures)
  defaultUrgent?: boolean;
}

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
  prescriptions: Prescription[]; labRequests: LabRequest[];
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

// --- DEBUT DES LIGNES D'EXEMPLE ---
// Example line 1: This is a dummy line added for example purposes.
// Example line 2: This is a dummy line added for example purposes.
// Example line 3: This is a dummy line added for example purposes.
// Example line 4: This is a dummy line added for example purposes.
// Example line 5: This is a dummy line added for example purposes.
// Example line 6: This is a dummy line added for example purposes.
// Example line 7: This is a dummy line added for example purposes.
// Example line 8: This is a dummy line added for example purposes.
// Example line 9: This is a dummy line added for example purposes.
// Example line 10: This is a dummy line added for example purposes.
// Example line 11: This is a dummy line added for example purposes.
// Example line 12: This is a dummy line added for example purposes.
// Example line 13: This is a dummy line added for example purposes.
// Example line 14: This is a dummy line added for example purposes.
// Example line 15: This is a dummy line added for example purposes.
// Example line 16: This is a dummy line added for example purposes.
// Example line 17: This is a dummy line added for example purposes.
// Example line 18: This is a dummy line added for example purposes.
// Example line 19: This is a dummy line added for example purposes.
// Example line 20: This is a dummy line added for example purposes.
// Example line 21: This is a dummy line added for example purposes.
// Example line 22: This is a dummy line added for example purposes.
// Example line 23: This is a dummy line added for example purposes.
// Example line 24: This is a dummy line added for example purposes.
// Example line 25: This is a dummy line added for example purposes.
// Example line 26: This is a dummy line added for example purposes.
// Example line 27: This is a dummy line added for example purposes.
// Example line 28: This is a dummy line added for example purposes.
// Example line 29: This is a dummy line added for example purposes.
// Example line 30: This is a dummy line added for example purposes.
// Example line 31: This is a dummy line added for example purposes.
// Example line 32: This is a dummy line added for example purposes.
// Example line 33: This is a dummy line added for example purposes.
// Example line 34: This is a dummy line added for example purposes.
// Example line 35: This is a dummy line added for example purposes.
// Example line 36: This is a dummy line added for example purposes.
// Example line 37: This is a dummy line added for example purposes.
// Example line 38: This is a dummy line added for example purposes.
// Example line 39: This is a dummy line added for example purposes.
// Example line 40: This is a dummy line added for example purposes.
// Example line 41: This is a dummy line added for example purposes.
// Example line 42: This is a dummy line added for example purposes.
// Example line 43: This is a dummy line added for example purposes.
// Example line 44: This is a dummy line added for example purposes.
// Example line 45: This is a dummy line added for example purposes.
// Example line 46: This is a dummy line added for example purposes.
// Example line 47: This is a dummy line added for example purposes.
// Example line 48: This is a dummy line added for example purposes.
// Example line 49: This is a dummy line added for example purposes.
// Example line 50: This is a dummy line added for example purposes.
// Example line 51: This is a dummy line added for example purposes.
// Example line 52: This is a dummy line added for example purposes.
// Example line 53: This is a dummy line added for example purposes.
// Example line 54: This is a dummy line added for example purposes.
// Example line 55: This is a dummy line added for example purposes.
// Example line 56: This is a dummy line added for example purposes.
// Example line 57: This is a dummy line added for example purposes.
// Example line 58: This is a dummy line added for example purposes.
// Example line 59: This is a dummy line added for example purposes.
// Example line 60: This is a dummy line added for example purposes.
// Example line 61: This is a dummy line added for example purposes.
// Example line 62: This is a dummy line added for example purposes.
// Example line 63: This is a dummy line added for example purposes.
// Example line 64: This is a dummy line added for example purposes.
// Example line 65: This is a dummy line added for example purposes.
// Example line 66: This is a dummy line added for example purposes.
// Example line 67: This is a dummy line added for example purposes.
// Example line 68: This is a dummy line added for example purposes.
// Example line 69: This is a dummy line added for example purposes.
// Example line 70: This is a dummy line added for example purposes.
// Example line 71: This is a dummy line added for example purposes.
// Example line 72: This is a dummy line added for example purposes.
// Example line 73: This is a dummy line added for example purposes.
// Example line 74: This is a dummy line added for example purposes.
// Example line 75: This is a dummy line added for example purposes.
// Example line 76: This is a dummy line added for example purposes.
// Example line 77: This is a dummy line added for example purposes.
// Example line 78: This is a dummy line added for example purposes.
// Example line 79: This is a dummy line added for example purposes.
// Example line 80: This is a dummy line added for example purposes.
// Example line 81: This is a dummy line added for example purposes.
// Example line 82: This is a dummy line added for example purposes.
// Example line 83: This is a dummy line added for example purposes.
// Example line 84: This is a dummy line added for example purposes.
// Example line 85: This is a dummy line added for example purposes.
// Example line 86: This is a dummy line added for example purposes.
// Example line 87: This is a dummy line added for example purposes.
// Example line 88: This is a dummy line added for example purposes.
// Example line 89: This is a dummy line added for example purposes.
// Example line 90: This is a dummy line added for example purposes.
// Example line 91: This is a dummy line added for example purposes.
// Example line 92: This is a dummy line added for example purposes.
// Example line 93: This is a dummy line added for example purposes.
// Example line 94: This is a dummy line added for example purposes.
// Example line 95: This is a dummy line added for example purposes.
// Example line 96: This is a dummy line added for example purposes.
// Example line 97: This is a dummy line added for example purposes.
// Example line 98: This is a dummy line added for example purposes.
// Example line 99: This is a dummy line added for example purposes.
// Example line 100: This is a dummy line added for example purposes.

// --- DEBUT DU BLOC D'EXEMPLE ---
// Ligne d'exemple 1 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 2 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 3 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 4 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 5 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 6 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 7 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 8 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 9 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 10 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 11 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 12 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 13 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 14 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 15 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 16 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 17 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 18 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 19 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 20 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 21 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 22 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 23 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 24 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 25 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 26 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 27 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 28 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 29 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 30 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 31 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 32 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 33 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 34 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 35 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 36 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 37 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 38 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 39 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 40 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 41 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 42 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 43 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 44 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 45 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 46 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 47 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 48 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 49 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 50 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 51 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 52 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 53 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 54 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 55 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 56 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 57 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 58 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 59 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 60 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 61 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 62 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 63 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 64 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 65 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 66 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 67 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 68 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 69 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 70 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 71 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 72 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 73 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 74 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 75 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 76 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 77 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 78 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 79 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 80 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 81 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 82 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 83 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 84 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 85 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 86 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 87 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 88 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 89 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 90 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 91 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 92 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 93 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 94 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 95 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 96 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 97 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 98 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 99 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 100 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// --- FIN DU BLOC D'EXEMPLE ---

// Example line 101: This is a dummy line added for example purposes.
// Example line 102: This is a dummy line added for example purposes.
// Example line 103: This is a dummy line added for example purposes.
// Example line 104: This is a dummy line added for example purposes.
// Example line 105: This is a dummy line added for example purposes.
// Example line 106: This is a dummy line added for example purposes.
// Example line 107: This is a dummy line added for example purposes.
// Example line 108: This is a dummy line added for example purposes.
// Example line 109: This is a dummy line added for example purposes.
// Example line 110: This is a dummy line added for example purposes.
// Example line 111: This is a dummy line added for example purposes.
// Example line 112: This is a dummy line added for example purposes.
// Example line 113: This is a dummy line added for example purposes.
// Example line 114: This is a dummy line added for example purposes.
// Example line 115: This is a dummy line added for example purposes.
// Example line 116: This is a dummy line added for example purposes.
// Example line 117: This is a dummy line added for example purposes.
// Example line 118: This is a dummy line added for example purposes.
// Example line 119: This is a dummy line added for example purposes.
// Example line 120: This is a dummy line added for example purposes.
// Example line 121: This is a dummy line added for example purposes.
// Example line 122: This is a dummy line added for example purposes.
// Example line 123: This is a dummy line added for example purposes.
// Example line 124: This is a dummy line added for example purposes.
// Example line 125: This is a dummy line added for example purposes.
// Example line 126: This is a dummy line added for example purposes.
// Example line 127: This is a dummy line added for example purposes.
// Example line 128: This is a dummy line added for example purposes.
// Example line 129: This is a dummy line added for example purposes.
// Example line 130: This is a dummy line added for example purposes.
// Example line 131: This is a dummy line added for example purposes.
// Example line 132: This is a dummy line added for example purposes.
// Example line 133: This is a dummy line added for example purposes.
// Example line 134: This is a dummy line added for example purposes.
// Example line 135: This is a dummy line added for example purposes.
// Example line 136: This is a dummy line added for example purposes.
// Example line 137: This is a dummy line added for example purposes.
// Example line 138: This is a dummy line added for example purposes.
// Example line 139: This is a dummy line added for example purposes.
// Example line 140: This is a dummy line added for example purposes.
// Example line 141: This is a dummy line added for example purposes.
// Example line 142: This is a dummy line added for example purposes.
// Example line 143: This is a dummy line added for example purposes.
// Example line 144: This is a dummy line added for example purposes.
// Example line 145: This is a dummy line added for example purposes.
// Example line 146: This is a dummy line added for example purposes.
// Example line 147: This is a dummy line added for example purposes.
// Example line 148: This is a dummy line added for example purposes.
// Example line 149: This is a dummy line added for example purposes.
// Example line 150: This is a dummy line added for example purposes.
// Example line 151: This is a dummy line added for example purposes.
// Example line 152: This is a dummy line added for example purposes.
// Example line 153: This is a dummy line added for example purposes.
// Example line 154: This is a dummy line added for example purposes.
// Example line 155: This is a dummy line added for example purposes.
// Example line 156: This is a dummy line added for example purposes.
// Example line 157: This is a dummy line added for example purposes.
// Example line 158: This is a dummy line added for example purposes.
// Example line 159: This is a dummy line added for example purposes.
// Example line 160: This is a dummy line added for example purposes.
// Example line 161: This is a dummy line added for example purposes.
// Example line 162: This is a dummy line added for example purposes.
// Example line 163: This is a dummy line added for example purposes.
// Example line 164: This is a dummy line added for example purposes.
// Example line 165: This is a dummy line added for example purposes.
// Example line 166: This is a dummy line added for example purposes.
// Example line 167: This is a dummy line added for example purposes.
// Example line 168: This is a dummy line added for example purposes.
// Example line 169: This is a dummy line added for example purposes.
// Example line 170: This is a dummy line added for example purposes.
// Example line 171: This is a dummy line added for example purposes.
// Example line 172: This is a dummy line added for example purposes.
// Example line 173: This is a dummy line added for example purposes.
// Example line 174: This is a dummy line added for example purposes.
// Example line 175: This is a dummy line added for example purposes.
// Example line 176: This is a dummy line added for example purposes.
// Example line 177: This is a dummy line added for example purposes.
// Example line 178: This is a dummy line added for example purposes.
// Example line 179: This is a dummy line added for example purposes.
// Example line 180: This is a dummy line added for example purposes.
// Example line 181: This is a dummy line added for example purposes.
// Example line 182: This is a dummy line added for example purposes.
// Example line 183: This is a dummy line added for example purposes.
// Example line 184: This is a dummy line added for example purposes.
// Example line 185: This is a dummy line added for example purposes.
// Example line 186: This is a dummy line added for example purposes.
// Example line 187: This is a dummy line added for example purposes.
// Example line 188: This is a dummy line added for example purposes.
// Example line 189: This is a dummy line added for example purposes.
// Example line 190: This is a dummy line added for example purposes.
// Example line 191: This is a dummy line added for example purposes.
// Example line 192: This is a dummy line added for example purposes.
// Example line 193: This is a dummy line added for example purposes.
// Example line 194: This is a dummy line added for example purposes.
// Example line 195: This is a dummy line added for example purposes.
// Example line 196: This is a dummy line added for example purposes.
// Example line 197: This is a dummy line added for example purposes.
// Example line 198: This is a dummy line added for example purposes.
// Example line 199: This is a dummy line added for example purposes.
// Example line 200: This is a dummy line added for example purposes.
// --- FIN DES LIGNES D'EXEMPLE ---

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

export interface Company { id: string; name: string; }

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
/** Ligne article d'un dossier Hospit/Bloc (même structure que ventes externes). */
export interface HbLine {
  id: string;
  articleName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  /** Date d'acte / de sortie — conservée entre validations de lignes. */
  dateSort?: string;
}

/** Dossier Hospitalisation ou Bloc Opératoire — partagé entre Caisse et Pharmacie
 *  (caisse de garde), car seul le paiement fait foi : qui saisit n'a pas d'importance. */
export interface HbRecord {
  id: string;
  patientId?: string;
  patientName: string;
  clientType: ClientType;
  company?: string;
  type: 'hospit' | 'bloc';
  lines: HbLine[];
  payments: { amount: number; paidBy: string; date: string; paidByUserId?: string }[];
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

/** Ligne de vente — correspond exactement à la demande :
 *  id, articleName, quantity, unitPrice, discount, dateSort (date d'acte/sortie). */
export interface VenteLine {
  /** Identifiant unique de la ligne (UUID). */
  id: string;
  /** FK → ventes.id */
  venteId: string;
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
}

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
