export type UserRole = 'receptionist' | 'doctor' | 'cashier' | 'pharmacy' | 'magasinier' | 'laboratory' | 'hospitalization' | 'admin';
export type ClientType = 'comptoir' | 'societe' | 'externe';
export type ArticleFamily = 'MEDIC' | 'LABO' | 'DENT' | 'ECHO';
export type PatientStatus = 'registered' | 'waiting_consultation' | 'in_consultation' | 'consulted_awaiting_payment' | 'invoice_paid' | 'medications_delivered' | 'analyses_pending' | 'analyses_complete' | 'hospitalized' | 'surgery_planned' | 'discharged' | 'completed';

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
  minStockCentral: number; minStockPharmacie: number;
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

export interface HospitalizationRecord {
  id: string; patientId: string; consultationId: string; service: string;
  roomNumber: string; bedNumber: string; admissionDate: string; dischargeDate?: string;
  dailyNotes: DailyNote[]; status: 'active' | 'discharged';
}

export interface DailyNote {
  id: string; date: string; authorId: string; authorName: string;
  vitalSigns?: Partial<VitalSigns>; nursingCare: string;
  doctorObservations: string; medicationsAdministered: string[];
}

export interface Bed { id: string; service: string; roomNumber: string; bedNumber: string; occupied: boolean; patientId?: string; }
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
