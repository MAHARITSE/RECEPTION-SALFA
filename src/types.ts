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
}

export interface Article {
  id: string; name: string; family: ArticleFamily; unit: string; barcode?: string;
  priceComptoir: number; priceSociete: number; priceExterne: number;
  purchasePrice: number; // prix d'achat
  stockCentral: number; stockPharmacie: number;
  minStockCentral: number; minStockPharmacie: number;
  expiryDate?: string; // date péremption
  supplier?: string;
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
  hospitalizeRequested: boolean; surgeryRequested: boolean; isEmergency: boolean;
}

export interface InvoiceItem { description: string; amount: number; category: 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization'; }

export interface Invoice {
  id: string; patientId?: string; consultationId?: string; clientName?: string;
  clientType: ClientType; items: InvoiceItem[]; totalAmount: number;
  patientCharge: number; status: 'pending' | 'paid';
  paidAt?: string; paidBy?: string; createdAt: string; isExternal: boolean;
}

export type TransferCategory = 'central' | 'hospitalisation' | 'bloc' | 'approvisionnement';

export interface StockTransfer {
  id: string; articleId: string; articleName: string; quantity: number;
  category: TransferCategory;
  purchasePrice?: number;
  expiryDate?: string;
  supplier?: string;
  invoiceRef?: string;
  requestedBy?: string; requestedAt?: string; transferredBy?: string; transferredAt?: string;
  status: 'requested' | 'transferred' | 'cancelled'; notes?: string;
}

export interface StockEntry {
  id: string; articleId: string; articleName: string; quantity: number;
  purchasePrice: number; supplier: string; invoiceRef: string;
  expiryDate?: string; date: string; enteredBy: string;
  category?: 'central' | 'hospitalisation' | 'bloc' | 'approvisionnement';
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
export interface Company { id: string; name: string; }
