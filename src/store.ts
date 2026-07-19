import { v4 as uuidv4 } from 'uuid';
import type {
  Patient, Consultation, Invoice, CashClosing, Article, AuditLog, VitalSigns, Prescription,
  Notification, UserRole, User, Company, Fournisseur, Famille,
  Message, StockTransfer, StockEntry, ClientType, ArticleFamily, TransferCategory,
  LabExamCatalog, LabCategory, LabRequest, PatientJourneyEvent, JourneyDepartment,
  WarehouseService, StockMovement, InventorySession, StockLocation,
  MovementHeader, MovementLine, MovementType
} from './types';

let dossierCounter = 100;
export function generateDossierNumber(ln: string): string { dossierCounter++; return `${ln.substring(0,3).toUpperCase().padEnd(3,'X')}${dossierCounter}`; }
export function calculateAge(bd: string): string {
  if (!bd || bd === 'N/A') return 'N/A';
  const t = new Date(), b = new Date(bd); let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() - b.getMonth() < 0 || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  if (a < 1) return `${(t.getFullYear()-b.getFullYear())*12+t.getMonth()-b.getMonth()} Mois`;
  return `${a} Ans`;
}
export function formatAr(n: number): string { return n.toLocaleString('fr-FR') + ' Ar'; }
export function formatMoney(n: number, currency: string = 'Ar'): string { return n.toLocaleString('fr-FR') + ' ' + currency; }
export function getPrice(a: Article, ct: ClientType): number {
  if (ct === 'societe') return a.priceSociete;
  if (ct === 'externe') return a.priceExterne;
  return a.priceComptoir;
}

const art = (name: string, fam: ArticleFamily, unit: string, pc: number, ps: number, pe: number, pp: number, sc: number, sp: number, msc: number, msp: number): Article => (
  { id: uuidv4(), name, family: fam, unit, priceComptoir: pc, priceSociete: ps, priceExterne: pe, purchasePrice: pp, stockCentral: sc, stockPharmacie: sp, minStockCentral: msc, minStockPharmacie: msp }
);

const seedArticles: Article[] = [
  art('Paracétamol 500mg','MEDIC','comprimé',500,450,600,200,800,120,100,50),
  art('Amoxicilline 1g','MEDIC','gélule',2000,1800,2500,1000,400,45,50,30),
  art('Ibuprofène 400mg','MEDIC','comprimé',800,700,1000,350,600,80,50,40),
  art('Oméprazole 20mg','MEDIC','gélule',1200,1000,1500,500,300,45,30,20),
  art('Metformine 850mg','MEDIC','comprimé',900,800,1100,400,350,60,30,25),
  art('Amlodipine 5mg','MEDIC','comprimé',1500,1300,1800,700,250,40,20,15),
  art('Tube EDTA','LABO','unité',300,250,400,100,200,50,30,20),
  art('Réactif Glycémie','LABO','flacon',5000,4500,6000,2500,30,10,5,3),
  art('Bandelette urinaire','LABO','boîte',3000,2500,3500,1500,20,8,5,3),
  art('Composite dentaire','DENT','seringue',15000,12000,18000,8000,15,5,3,2),
  art('Anesthésique dentaire','DENT','cartouche',3000,2500,3500,1200,40,15,10,5),
  art('Gel échographie','ECHO','flacon',5000,4000,6000,2000,12,4,5,2),
  art('Papier thermique','ECHO','rouleau',2000,1800,2500,800,25,8,5,3),
];

const seedCompanies: Company[] = [
  { id: uuidv4(), name: 'JIRAMA' },{ id: uuidv4(), name: 'TELMA' },
  { id: uuidv4(), name: 'AIR MADAGASCAR' },{ id: uuidv4(), name: 'AMBATOVY' },
  { id: uuidv4(), name: 'QMM / RIO TINTO' },{ id: uuidv4(), name: 'STAR BRASSERIES' },
  { id: uuidv4(), name: 'BNI MADAGASCAR' },{ id: uuidv4(), name: 'SOCIMEX' },
];

/** Services d'entrepôt par défaut — le dépôt central disperse vers ces services */
export const SEED_WAREHOUSE_SERVICES: WarehouseService[] = [
  { id: 'svc-pharmacie', code: 'PHA', name: 'Pharmacie', kind: 'pharmacie', color: 'purple', active: true, createdAt: new Date().toISOString() },
  { id: 'svc-bloc', code: 'BLOC', name: 'Bloc opératoire', kind: 'service', color: 'blue', active: true, createdAt: new Date().toISOString() },
  { id: 'svc-soins', code: 'SOINS', name: 'Soins / Hospitalisation', kind: 'service', color: 'rose', active: true, createdAt: new Date().toISOString() },
  { id: 'svc-labo', code: 'LABO', name: 'Laboratoire', kind: 'service', color: 'emerald', active: true, createdAt: new Date().toISOString() },
  { id: 'svc-urgence', code: 'URG', name: 'Urgences', kind: 'service', color: 'amber', active: true, createdAt: new Date().toISOString() },
];

/** Stock d'un article pour une localisation (central | pharmacie | serviceId) */
export function getArticleStock(a: Article, location: StockLocation): number {
  if (location === 'central') return a.stockCentral;
  if (location === 'pharmacie') return a.stockPharmacie;
  return a.serviceStocks?.[location] ?? 0;
}

/** Applique un delta de stock sur une localisation */
export function applyStockDelta(a: Article, location: StockLocation, delta: number): Article {
  if (location === 'central') return { ...a, stockCentral: Math.max(0, a.stockCentral + delta) };
  if (location === 'pharmacie') return { ...a, stockPharmacie: Math.max(0, a.stockPharmacie + delta) };
  const prev = a.serviceStocks?.[location] ?? 0;
  return {
    ...a,
    serviceStocks: { ...(a.serviceStocks || {}), [location]: Math.max(0, prev + delta) },
  };
}

export function locationLabel(location: StockLocation, services: WarehouseService[] = []): string {
  if (location === 'central') return 'Dépôt central';
  if (location === 'pharmacie') return 'Pharmacie';
  const svc = services.find(s => s.id === location);
  return svc?.name || location;
}

/* ====== FONCTIONS UTILITAIRES POUR MOUVEMENTS AVEC EN-TÊTE + LIGNES ====== */

/** Crée un en-tête de mouvement + ses lignes dans la base */
export function createMovementWithLines(
  state: AppState,
  header: Omit<MovementHeader, 'id' | 'date'>,
  lines: Array<Omit<MovementLine, 'id' | 'movementId'>>
): { header: MovementHeader; lines: MovementLine[] } {
  const movementId = uuidv4();
  const now = new Date().toISOString();

  const fullHeader: MovementHeader = {
    id: movementId,
    date: now,
    ...header,
    totalQuantity: header.totalQuantity ?? lines.reduce((sum, l) => sum + l.quantity, 0),
  };

  const fullLines: MovementLine[] = lines.map((line, index) => ({
    id: uuidv4(),
    movementId,
    ...line,
  }));

  // Push into state arrays (mutation-friendly for React state updates)
  state.movementHeaders = [...(state.movementHeaders || []), fullHeader];
  state.movementLines = [...(state.movementLines || []), ...fullLines];

  return { header: fullHeader, lines: fullLines };
}

/** Récupère toutes les lignes d'un mouvement */
export function getMovementLines(state: AppState, movementId: string): MovementLine[] {
  return (state.movementLines || []).filter(l => l.movementId === movementId);
}

/** Récupère le mouvement par id */
export function getMovementHeader(state: AppState, movementId: string): MovementHeader | undefined {
  return (state.movementHeaders || []).find(h => h.id === movementId);
}

/** Article vendable en pharmacie : stock > 0 et non bloqué */
export function isArticleSaleable(a: Article): boolean {
  return !a.saleBlocked && a.stockPharmacie > 0;
}

const seedPatients: Patient[] = [
  { id: uuidv4(), dossier: 'MAR101', firstName: 'Jean', lastName: 'MARTIN', dateOfBirth: '1985-03-15', age: '39 Ans', gender: 'M', address: 'ANTANANARIVO', contact: '034 12 345 67', ssn: '', allergies: ['Pénicilline'], chronicTreatments: ['Amlodipine 5mg'], antecedents: ['Hypertension'], bloodGroup: 'O+', registeredAt: new Date().toISOString(), registeredBy: 'SYSTEM', status: 'registered', clientType: 'comptoir', blacklisted: true, blacklistReason: 'Impayés répétés — exemple de contrôle', blacklistDate: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: uuidv4(), dossier: 'DUP102', firstName: 'Marie', lastName: 'DUPONT', dateOfBirth: '1990-07-22', age: '34 Ans', gender: 'F', address: 'TOAMASINA', contact: '033 98 765 43', ssn: '', allergies: [], chronicTreatments: [], antecedents: [], bloodGroup: 'A+', registeredAt: new Date().toISOString(), registeredBy: 'SYSTEM', status: 'registered', clientType: 'societe', company: 'JIRAMA', subCompany: 'Direction Régionale' },
  { id: uuidv4(), dossier: 'RAK103', firstName: 'Solo', lastName: 'RAKOTO', dateOfBirth: '2015-11-08', age: '9 Ans', gender: 'M', address: 'FIANARANTSOA', contact: '032 11 222 33', ssn: '', insureName: 'RAKOTO JEAN', allergies: ['Aspirine'], chronicTreatments: [], antecedents: ['Asthme'], bloodGroup: 'B+', registeredAt: new Date().toISOString(), registeredBy: 'SYSTEM', status: 'registered', clientType: 'comptoir' },
];

const users: User[] = [
  { id: 'DOC001', name: 'Dr. Jean Martin', role: 'doctor', password: 'doc123' },
  { id: 'DOC002', name: 'Dr. Sophie Leclerc', role: 'doctor', password: 'doc123' },
  { id: 'DOC003', name: 'Dr. Ahmed Benali', role: 'doctor', password: 'doc123' },
  { id: 'CAS001', name: 'Pierre Duval', role: 'cashier', password: 'caisse123' },
  { id: 'PHA001', name: 'Fatima Benali', role: 'pharmacy', password: 'pharma123' },
  { id: 'MAG001', name: 'Ali Rasolofo', role: 'magasinier', password: 'mag123' },
  { id: 'LAB001', name: 'Thomas Nguyen', role: 'laboratory', password: 'labo123' },
  { id: 'ADM001', name: 'Admin Système', role: 'admin', password: 'admin123' },
];

export const CONSULTATION_FEE = 10000;
export const LAB_FEE = 15000;
export const LAB_FEE_URGENT = 25000;
export const SURGERY_FEE = 500000;

export const SEED_FOURNISSEURS: Fournisseur[] = [
  { id: 'fourn-1', name: 'PHARMA LABS S.A.', contactPerson: 'M. Rabe', phone: '034 00 111 22', email: 'contact@pharmalabs.mg', address: 'Ankorondrano, Antananarivo', nif: '1000234567', stat: '51301 11 2018 0 00123' },
  { id: 'fourn-2', name: 'MEDICIS IMPORT', contactPerson: 'Mme Razafy', phone: '033 11 222 33', email: 'ventes@medicis.mg', address: 'Ankorondrano, Antananarivo', nif: '1000345678', stat: '51301 11 2019 0 00456' },
  { id: 'fourn-3', name: 'SANTE EQUIPEMENT MADAGASCAR', contactPerson: 'M. Jean', phone: '032 22 333 44', email: 'info@sem-madagascar.com', address: 'Isoraka, Antananarivo', nif: '1000456789', stat: '51301 11 2020 0 00789' },
  { id: 'fourn-4', name: 'DISPHAR LABO', contactPerson: 'M. Andry', phone: '034 44 555 66', email: 'commande@disphar.mg', address: 'Andraharo, Antananarivo', nif: '1000567890', stat: '51301 11 2021 0 00321' },
];

export const SEED_FAMILLES: Famille[] = [
  { id: 'fam-medic', code: 'MEDIC', name: 'Médicaments', color: '#0D47A1', order: 1 },
  { id: 'fam-labo', code: 'LABO', name: 'Laboratoire', color: '#10B981', order: 2 },
  { id: 'fam-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 3 },
  { id: 'fam-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 4 },
];

export interface AppState {
  currentUser: User | null; ticketSettings: import('./types').TicketSettings; patients: Patient[]; consultations: Consultation[];
  invoices: Invoice[]; cashClosings: CashClosing[]; articles: Article[];
  stockTransfers: StockTransfer[];
  stockEntries: StockEntry[]; auditLogs: AuditLog[]; notifications: Notification[];
  messages: Message[]; users: User[]; companies: Company[];
  fournisseurs: Fournisseur[];
  familles: Famille[];
  journey: PatientJourneyEvent[];          // parcours patient (timeline)
  labRequests: LabRequest[];               // demandes d'analyse autonomes
  labCatalog: LabExamCatalog[];            // catalogue d'examens
  warehouseServices: WarehouseService[];  // services destinataires du dépôt
  stockMovements: StockMovement[];         // entrées / sorties / transferts (legacy)
  inventorySessions: InventorySession[];   // inventaires
  movementHeaders: MovementHeader[];       // en-têtes de mouvement (achat, vente, transfert, inventaire, sortie)
  movementLines: MovementLine[];           // lignes associées aux mouvements
}

export function createInitialState(): AppState {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

  // ===================== PATIENT DÉMO — DOSSIER COMPLET =====================
  const leaId = uuidv4();
  const leaConsultId = uuidv4();
  const leaInvoiceId = uuidv4();
  const leaLabInvoiceId = uuidv4();
  const leaNfsId = uuidv4();
  const leaGlyId = uuidv4();

  const lea: Patient = {
    id: leaId, dossier: 'AND104', firstName: 'Léa', lastName: 'ANDRIAMANANA',
    dateOfBirth: '1992-05-10', age: '34 Ans', gender: 'F', address: 'ANTANANARIVO',
    contact: '034 55 667 78', ssn: '', allergies: ['Pénicilline'],
    chronicTreatments: ['Levothyrox 75µg'], antecedents: ['Hypothyroïdie', 'Asthme'], bloodGroup: 'A+',
    vitalSigns: { temperature: '38.2', bloodPressureSystolic: '120', bloodPressureDiastolic: '80', heartRate: '98', oxygenSaturation: '96', weight: '58', height: '162', tdr: 'Négatif' },
    registeredAt: daysAgo(5), registeredBy: 'RECEPTION', status: 'medications_delivered',
    lastVisitAt: daysAgo(4),
    clientType: 'societe', company: 'TELMA',
  };

  const leaConsult: Consultation = {
    id: leaConsultId, patientId: leaId, doctorId: 'DOC001', doctorName: 'Dr. Jean Martin',
    date: daysAgo(4),
    vitalSigns: { temperature: '38.2', bloodPressureSystolic: '120', bloodPressureDiastolic: '80', heartRate: '98', oxygenSaturation: '96', weight: '58', height: '162' },
    visitReason: 'Fièvre et toux depuis 4 jours',
    diagnosis: 'Bronchopneumonie aiguë',
    notes: 'Auscultation : râles crépitants base droite. CRP élevée.',
    prescriptions: [
      { id: uuidv4(), articleId: '', articleName: 'Amoxicilline 1g', quantity: 6, posology: '1 cp x3/j', duration: '7 jours', instructions: 'Pendant les repas', unitPrice: 2000, discount: 0, delivered: true },
      { id: uuidv4(), articleId: '', articleName: 'Paracétamol 500mg', quantity: 10, posology: '1 cp x3/j si fièvre', duration: '5 jours', instructions: '', unitPrice: 500, discount: 0, delivered: true },
    ],
    labRequests: [], hospitalizeRequested: false, surgeryRequested: false, isEmergency: false,
  };

  const leaInvoice: Invoice = {
    id: leaInvoiceId, patientId: leaId, consultationId: leaConsultId, clientType: 'societe',
    items: [
      { description: 'Amoxicilline 1g × 6', amount: 12000, category: 'pharmacy' },
      { description: 'Paracétamol 500mg × 10', amount: 5000, category: 'pharmacy' },
    ],
    totalAmount: 17000, patientCharge: 17000, status: 'paid',
    paidAt: daysAgo(4), paidBy: 'CAS001', createdAt: daysAgo(4), isExternal: false,
  };

  const leaLabInvoice: Invoice = {
    id: leaLabInvoiceId, patientId: leaId, clientType: 'societe',
    items: [
      { description: 'NFS', amount: 15000, category: 'lab' },
      { description: 'Glycémie à jeun', amount: 15000, category: 'lab' },
    ],
    totalAmount: 30000, patientCharge: 30000, status: 'paid',
    paidAt: daysAgo(4), paidBy: 'CAS001', createdAt: daysAgo(4), isExternal: false,
  };

  const leaLabRequests: LabRequest[] = [
    {
      id: leaNfsId, patientId: leaId, examType: 'NFS', code: 'HEM001', category: 'hematologie',
      parameters: ['Globules Rouges', 'Globules Blancs', 'Hémoglobine', 'Plaquettes', 'Hématocrite'],
      urgent: false, status: 'completed', sampleType: 'Sang veineux',
      sampleReceived: true, sampleReceivedAt: daysAgo(4), requestedBy: 'DOC001', requestedAt: daysAgo(4),
      invoiceId: leaLabInvoiceId, price: 15000,
      results: [
        { parameter: 'Globules Rouges', value: 4.8, unit: 'T/L', normalMin: 4.0, normalMax: 5.5, isAbnormal: false },
        { parameter: 'Globules Blancs', value: 15.2, unit: 'G/L', normalMin: 4.0, normalMax: 10.0, isAbnormal: true },
        { parameter: 'Hémoglobine', value: 11.5, unit: 'g/dL', normalMin: 12.0, normalMax: 17.0, isAbnormal: true },
        { parameter: 'Plaquettes', value: 280, unit: 'G/L', normalMin: 150, normalMax: 400, isAbnormal: false },
        { parameter: 'Hématocrite', value: 36, unit: '%', normalMin: 36, normalMax: 50, isAbnormal: false },
      ],
      completedAt: daysAgo(4), completedBy: 'LAB001', validatedBy: 'LAB001',
    },
    {
      id: leaGlyId, patientId: leaId, examType: 'Glycémie à jeun', code: 'BIO001', category: 'biochimie',
      parameters: ['Glucose'], urgent: false, status: 'completed', sampleType: 'Sang veineux',
      sampleReceived: true, sampleReceivedAt: daysAgo(4), requestedBy: 'DOC001', requestedAt: daysAgo(4),
      invoiceId: leaLabInvoiceId, price: 15000,
      results: [{ parameter: 'Glucose', value: 0.92, unit: 'g/L', normalMin: 0.7, normalMax: 1.1, isAbnormal: false }],
      completedAt: daysAgo(4), completedBy: 'LAB001', validatedBy: 'LAB001',
    },
  ];

  const leaJourney: PatientJourneyEvent[] = [
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(5), department: 'reception', action: 'Enregistrement patient', status: 'registered', details: 'Dossier AND104 créé — TELMA', actorName: 'Réception' },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(5), department: 'reception', action: 'Adressé au médecin', status: 'waiting_consultation', details: 'Paramètres vitaux saisis', actorName: 'Réception' },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'consultation', action: 'Consultation', status: 'in_consultation', details: 'Dr. Jean Martin — Diagnostic: Bronchopneumonie aiguë', actorId: 'DOC001', actorName: 'Dr. Jean Martin', consultationId: leaConsultId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'consultation', action: 'Consultation terminée', status: 'consulted_awaiting_payment', details: 'Ordonnance + demandes d\'analyses', actorId: 'DOC001', actorName: 'Dr. Jean Martin', consultationId: leaConsultId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'laboratoire', action: 'Demande d\'analyse', status: 'paid', details: 'NFS, Glycémie à jeun', actorId: 'DOC001', actorName: 'Dr. Jean Martin', labRequestId: leaNfsId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'laboratoire', action: 'Échantillon réceptionné', details: 'Sang veineux — tube EDTA', actorId: 'LAB001', actorName: 'Thomas Nguyen', labRequestId: leaNfsId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'laboratoire', action: 'Résultats validés', status: 'completed', details: 'NFS — 2 paramètres anormaux (GB, Hb)', actorId: 'LAB001', actorName: 'Thomas Nguyen', labRequestId: leaNfsId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'laboratoire', action: 'Résultats validés', status: 'completed', details: 'Glycémie à jeun — Normal', actorId: 'LAB001', actorName: 'Thomas Nguyen', labRequestId: leaGlyId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'caisse', action: 'Paiement enregistré', status: 'invoice_paid', details: '17 000 Ar (pharmacie) + 30 000 Ar (labo)', actorId: 'CAS001', actorName: 'Pierre Duval', invoiceId: leaInvoiceId },
    { id: uuidv4(), patientId: leaId, timestamp: daysAgo(4), department: 'pharmacie', action: 'Médicaments délivrés', status: 'medications_delivered', details: 'Amoxicilline 1g ×6, Paracétamol ×10', actorName: 'Fatima Benali' },
  ];

  const baseJourney: PatientJourneyEvent[] = seedPatients.map((p) => ({
    id: uuidv4(), patientId: p.id, timestamp: p.registeredAt, department: 'reception' as JourneyDepartment,
    action: 'Enregistrement patient', status: 'registered', details: `Dossier ${p.dossier} créé`, actorName: 'Système',
  }));

  // ===================== PATIENTS DÉMO — FLUX LABORATOIRE COMPLET =====================
  // But : peupler la base avec des noms et illustrer tout le circuit
  // (à facturer en caisse → payé → file labo → prélèvement → résultats → A5).
  const defaultVS: VitalSigns = { temperature: '36.7', bloodPressureSystolic: '120', bloodPressureDiastolic: '80', heartRate: '75', oxygenSaturation: '98', weight: '65', height: '165' };
  const mkPatient = (dossier: string, firstName: string, lastName: string, gender: 'M' | 'F', dob: string, opts: Partial<Patient> = {}): Patient => ({
    id: uuidv4(), dossier, firstName, lastName, dateOfBirth: dob, age: calculateAge(dob),
    gender, address: opts.address || 'ANTANANARIVO', contact: opts.contact || '', ssn: '',
    allergies: opts.allergies || [], chronicTreatments: opts.chronicTreatments || [], antecedents: opts.antecedents || [], bloodGroup: opts.bloodGroup,
    vitalSigns: opts.vitalSigns, registeredAt: opts.registeredAt || daysAgo(1), registeredBy: 'RECEPTION',
    status: opts.status || 'registered', clientType: opts.clientType || 'comptoir',
    company: opts.clientType === 'societe' ? opts.company : undefined, subCompany: opts.clientType === 'societe' ? opts.subCompany : undefined,
    // Dernière visite : fournie ou déduite si le patient a déjà un parcours actif
    lastVisitAt: opts.lastVisitAt || (opts.status && opts.status !== 'registered' ? (opts.registeredAt || daysAgo(1)) : undefined),
  });
  const mkConsult = (patientId: string, doctorId: string, doctorName: string, diagnosis: string, opts: Partial<Consultation> = {}): Consultation => ({
    id: uuidv4(), patientId, doctorId, doctorName, date: opts.date || daysAgo(1),
    vitalSigns: opts.vitalSigns || defaultVS, visitReason: opts.visitReason || '', diagnosis, notes: opts.notes || '',
    prescriptions: opts.prescriptions || [], labRequests: [], hospitalizeRequested: false, surgeryRequested: false, isEmergency: false,
  });
  const jEv = (patientId: string, department: JourneyDepartment, action: string, status: Patient['status'], details: string, actorName: string, extra: Partial<PatientJourneyEvent> = {}): PatientJourneyEvent => ({
    id: uuidv4(), patientId, timestamp: extra.timestamp || daysAgo(1), department, action, status, details, actorName,
    actorId: extra.actorId, consultationId: extra.consultationId, invoiceId: extra.invoiceId, labRequestId: extra.labRequestId,
  });

  // --- RAK105 : analyses DÉJÀ PAYÉES, en attente de prélèvement (file labo) ---
  const rak105 = mkPatient('RAK105', 'Hery', 'RAKOTOARIVELO', 'M', '1978-02-12', { clientType: 'societe', company: 'JIRAMA', status: 'analyses_pending', allergies: ['Iode'], antecedents: ['Diabète type 2'], bloodGroup: 'B+', registeredAt: daysAgo(2), lastVisitAt: daysAgo(2) });
  const rak105Consult = mkConsult(rak105.id, 'DOC002', 'Dr. Sophie Leclerc', 'Diabète type 2 — contrôle', { date: daysAgo(2), visitReason: 'Suivi diabète' });
  const rak105InvId = uuidv4();
  const rak105ReqId = uuidv4();
  const rak105Inv: Invoice = { id: rak105InvId, patientId: rak105.id, consultationId: rak105Consult.id, clientType: 'societe', items: [{ description: 'Bilan hépatique', amount: 22000, category: 'lab' }], totalAmount: 22000, patientCharge: 22000, status: 'paid', paidAt: daysAgo(2), paidBy: 'CAS001', createdAt: daysAgo(2), isExternal: false };
  const rak105Req: LabRequest = { id: rak105ReqId, patientId: rak105.id, consultationId: rak105Consult.id, examType: 'Bilan hépatique', code: 'BIO003', category: 'biochimie', parameters: ['ASAT', 'ALAT', 'GGT', 'Bilirubine'], urgent: false, status: 'paid', sampleType: 'Sang veineux', sampleReceived: false, requestedBy: 'DOC002', requestedAt: daysAgo(2), invoiceId: rak105InvId, price: 22000 };

  // --- RAS106 : prélèvement effectué, analyse EN COURS ---
  const ras106 = mkPatient('RAS106', 'Soa', 'RASOA', 'F', '1991-09-03', { clientType: 'comptoir', status: 'analyses_pending', allergies: ['Aspirine'], antecedents: ['Asthme'], bloodGroup: 'A+', registeredAt: daysAgo(1), lastVisitAt: daysAgo(1) });
  const ras106Consult = mkConsult(ras106.id, 'DOC001', 'Dr. Jean Martin', 'Anémie à préciser', { date: daysAgo(1), visitReason: 'Fatigue, pâleur' });
  const ras106InvId = uuidv4();
  const ras106ReqId = uuidv4();
  const ras106Inv: Invoice = { id: ras106InvId, patientId: ras106.id, consultationId: ras106Consult.id, clientType: 'comptoir', items: [{ description: 'NFS', amount: 15000, category: 'lab' }], totalAmount: 15000, patientCharge: 15000, status: 'paid', paidAt: daysAgo(1), paidBy: 'CAS001', createdAt: daysAgo(1), isExternal: false };
  const ras106Req: LabRequest = { id: ras106ReqId, patientId: ras106.id, consultationId: ras106Consult.id, examType: 'NFS', code: 'HEM001', category: 'hematologie', parameters: ['Globules Rouges', 'Globules Blancs', 'Hémoglobine', 'Plaquettes', 'Hématocrite'], urgent: false, status: 'in_progress', sampleType: 'Sang veineux (EDTA)', sampleReceived: true, sampleReceivedAt: daysAgo(1), requestedBy: 'DOC001', requestedAt: daysAgo(1), invoiceId: ras106InvId, price: 15000 };

  // --- AND107 : analyses TERMINÉES (résultats disponibles, impression A5) ---
  const and107 = mkPatient('AND107', 'Fara', 'ANDRIANINA', 'F', '1985-12-20', { clientType: 'societe', company: 'TELMA', status: 'analyses_complete', antecedents: ['Hypothyroïdie'], bloodGroup: 'O+', registeredAt: daysAgo(3), lastVisitAt: daysAgo(3) });
  const and107Consult = mkConsult(and107.id, 'DOC002', 'Dr. Sophie Leclerc', 'Bilan thyroïdien & lipidique', { date: daysAgo(3), visitReason: 'Contrôle' });
  const and107InvId = uuidv4();
  const and107NfsId = uuidv4();
  const and107LipId = uuidv4();
  const and107Inv: Invoice = { id: and107InvId, patientId: and107.id, consultationId: and107Consult.id, clientType: 'societe', items: [{ description: 'NFS', amount: 13000, category: 'lab' }, { description: 'Bilan lipidique', amount: 18000, category: 'lab' }], totalAmount: 31000, patientCharge: 31000, status: 'paid', paidAt: daysAgo(3), paidBy: 'CAS001', createdAt: daysAgo(3), isExternal: false };
  const and107Nfs: LabRequest = { id: and107NfsId, patientId: and107.id, consultationId: and107Consult.id, examType: 'NFS', code: 'HEM001', category: 'hematologie', parameters: ['Globules Rouges', 'Globules Blancs', 'Hémoglobine', 'Plaquettes', 'Hématocrite'], urgent: false, status: 'completed', sampleType: 'Sang veineux (EDTA)', sampleReceived: true, sampleReceivedAt: daysAgo(3), requestedBy: 'DOC002', requestedAt: daysAgo(3), invoiceId: and107InvId, price: 13000, results: [
    { parameter: 'Globules Rouges', value: 4.6, unit: 'T/L', normalMin: 4.0, normalMax: 5.5, isAbnormal: false },
    { parameter: 'Globules Blancs', value: 6.1, unit: 'G/L', normalMin: 4.0, normalMax: 10.0, isAbnormal: false },
    { parameter: 'Hémoglobine', value: 10.8, unit: 'g/dL', normalMin: 12.0, normalMax: 17.0, isAbnormal: true },
    { parameter: 'Plaquettes', value: 260, unit: 'G/L', normalMin: 150, normalMax: 400, isAbnormal: false },
    { parameter: 'Hématocrite', value: 33, unit: '%', normalMin: 36, normalMax: 50, isAbnormal: true },
  ], completedAt: daysAgo(3), completedBy: 'LAB001', validatedBy: 'LAB001' };
  const and107Lip: LabRequest = { id: and107LipId, patientId: and107.id, consultationId: and107Consult.id, examType: 'Bilan lipidique', code: 'BIO005', category: 'biochimie', parameters: ['Cholestérol Total', 'HDL', 'LDL', 'Triglycérides'], urgent: false, status: 'completed', sampleType: 'Sang veineux', sampleReceived: true, sampleReceivedAt: daysAgo(3), requestedBy: 'DOC002', requestedAt: daysAgo(3), invoiceId: and107InvId, price: 18000, results: [
    { parameter: 'Cholestérol Total', value: 2.4, unit: 'g/L', normalMin: 1.5, normalMax: 2.0, isAbnormal: true },
    { parameter: 'HDL', value: 0.5, unit: 'g/L', normalMin: 0.4, normalMax: 0.6, isAbnormal: false },
    { parameter: 'LDL', value: 1.7, unit: 'g/L', normalMin: 0.7, normalMax: 1.6, isAbnormal: true },
    { parameter: 'Triglycérides', value: 1.1, unit: 'g/L', normalMin: 0.5, normalMax: 1.5, isAbnormal: false },
  ], completedAt: daysAgo(3), completedBy: 'LAB001', validatedBy: 'LAB001' };

  // --- RAB108 : en attente à la CAISSE (onglet Laboratoire) + médicaments ---
  const rab108 = mkPatient('RAB108', 'Lala', 'RABEARIVELO', 'M', '1969-04-15', { clientType: 'comptoir', status: 'consulted_awaiting_payment', antecedents: ['Hypertension'], bloodGroup: 'AB+', registeredAt: daysAgo(0), lastVisitAt: daysAgo(0) });
  const rab108Paracetamol: Prescription = { id: uuidv4(), articleId: '', articleName: 'Paracétamol 500mg', quantity: 10, posology: '1 cp x3/j', duration: '5 jours', instructions: '', unitPrice: 500, discount: 0, delivered: false };
  const rab108Consult = mkConsult(rab108.id, 'DOC003', 'Dr. Ahmed Benali', 'Hypertension — contrôle rénal', { date: daysAgo(0), visitReason: 'Suivi TA', prescriptions: [rab108Paracetamol] });
  const rab108PharmaInvId = uuidv4();
  const rab108LabInvId = uuidv4();
  const rab108ReqId = uuidv4();
  const rab108PharmaInv: Invoice = { id: rab108PharmaInvId, patientId: rab108.id, consultationId: rab108Consult.id, clientType: 'comptoir', items: [{ description: 'Paracétamol 500mg × 10', amount: 5000, category: 'pharmacy' }], totalAmount: 5000, patientCharge: 5000, status: 'pending', createdAt: daysAgo(0), isExternal: false };
  const rab108LabInv: Invoice = { id: rab108LabInvId, patientId: rab108.id, consultationId: rab108Consult.id, clientType: 'comptoir', items: [{ description: 'Créatinine', amount: 10000, category: 'lab' }, { description: 'Urée', amount: 9000, category: 'lab' }], totalAmount: 19000, patientCharge: 19000, status: 'pending', createdAt: daysAgo(0), isExternal: false };
  const rab108Req: LabRequest = { id: rab108ReqId, patientId: rab108.id, consultationId: rab108Consult.id, examType: 'Créatinine', code: 'BIO002', category: 'biochimie', parameters: ['Créatinine'], urgent: false, status: 'pending', sampleType: 'Sang veineux', requestedBy: 'DOC003', requestedAt: daysAgo(0), invoiceId: rab108LabInvId, price: 10000 };

  const demoPatients = [rak105, ras106, and107, rab108];

  // Additional demo patients for rich base preview
  const morePatients: Patient[] = [
    mkPatient('KAN109', 'Aina', 'KANDRIANA', 'F', '1988-04-02', { clientType: 'societe', company: 'AIR MADAGASCAR', status: 'registered', antecedents: ['Allergie pollen'], bloodGroup: 'O-' }),
    mkPatient('ZAF110', 'Mickael', 'ZAFY', 'M', '1975-11-30', { clientType: 'comptoir', status: 'waiting_consultation', allergies: ['Pénicilline'], vitalSigns: { temperature: '37.8', bloodPressureSystolic: '135', bloodPressureDiastolic: '85', heartRate: '82', oxygenSaturation: '97', weight: '78', height: '172' } }),
    mkPatient('RAZ111', 'Lanto', 'RAZAFIMANANA', 'F', '2001-08-15', { clientType: 'societe', company: 'BNI MADAGASCAR', status: 'analyses_pending', bloodGroup: 'A-' }),
    mkPatient('BEN112', 'Pierre', 'BENOIT', 'M', '1965-01-25', { clientType: 'comptoir', status: 'registered', antecedents: ['Diabète'] }),
    mkPatient('MAN113', 'Nirina', 'MANANJARA', 'F', '1995-06-12', { clientType: 'societe', company: 'QMM / RIO TINTO', status: 'consulted_awaiting_payment', vitalSigns: { temperature: '36.9', bloodPressureSystolic: '110', bloodPressureDiastolic: '70', heartRate: '68', oxygenSaturation: '99', weight: '52', height: '160' } }),
  ];
  const demoConsultations = [rak105Consult, ras106Consult, and107Consult, rab108Consult];
  const demoInvoices = [rak105Inv, ras106Inv, and107Inv, rab108PharmaInv, rab108LabInv];
  const demoLabs = [rak105Req, ras106Req, and107Nfs, and107Lip, rab108Req];
  const demoJourney: PatientJourneyEvent[] = [
    jEv(rak105.id, 'reception', 'Enregistrement patient', 'registered', `Dossier RAK105 créé — JIRAMA`, 'Réception', { timestamp: daysAgo(2) }),
    jEv(rak105.id, 'consultation', 'Consultation terminée', 'consulted_awaiting_payment', 'Dr. Sophie Leclerc — Diabète type 2', 'Dr. Sophie Leclerc', { timestamp: daysAgo(2), consultationId: rak105Consult.id }),
    jEv(rak105.id, 'laboratoire', 'Demande d\'analyse', 'analyses_pending', 'Bilan hépatique', 'Dr. Sophie Leclerc', { timestamp: daysAgo(2), labRequestId: rak105ReqId, consultationId: rak105Consult.id }),
    jEv(rak105.id, 'caisse', 'Paiement analyses', 'invoice_paid', 'Bilan hépatique — 22 000 Ar', 'Pierre Duval', { timestamp: daysAgo(2), invoiceId: rak105InvId }),
    jEv(ras106.id, 'reception', 'Enregistrement patient', 'registered', `Dossier RAS106 créé`, 'Réception', { timestamp: daysAgo(1) }),
    jEv(ras106.id, 'consultation', 'Consultation terminée', 'consulted_awaiting_payment', 'Dr. Jean Martin — Anémie', 'Dr. Jean Martin', { timestamp: daysAgo(1), consultationId: ras106Consult.id }),
    jEv(ras106.id, 'laboratoire', 'Demande d\'analyse', 'analyses_pending', 'NFS', 'Dr. Jean Martin', { timestamp: daysAgo(1), labRequestId: ras106ReqId, consultationId: ras106Consult.id }),
    jEv(ras106.id, 'caisse', 'Paiement analyses', 'invoice_paid', 'NFS — 15 000 Ar', 'Pierre Duval', { timestamp: daysAgo(1), invoiceId: ras106InvId }),
    jEv(ras106.id, 'laboratoire', 'Échantillon réceptionné', 'analyses_pending', 'Sang veineux (EDTA)', 'Thomas Nguyen', { timestamp: daysAgo(1), labRequestId: ras106ReqId }),
    jEv(and107.id, 'reception', 'Enregistrement patient', 'registered', `Dossier AND107 créé — TELMA`, 'Réception', { timestamp: daysAgo(3) }),
    jEv(and107.id, 'consultation', 'Consultation terminée', 'consulted_awaiting_payment', 'Dr. Sophie Leclerc — Bilan', 'Dr. Sophie Leclerc', { timestamp: daysAgo(3), consultationId: and107Consult.id }),
    jEv(and107.id, 'laboratoire', 'Demande d\'analyse', 'analyses_pending', 'NFS, Bilan lipidique', 'Dr. Sophie Leclerc', { timestamp: daysAgo(3), consultationId: and107Consult.id }),
    jEv(and107.id, 'caisse', 'Paiement analyses', 'invoice_paid', 'NFS + Bilan lipidique — 31 000 Ar', 'Pierre Duval', { timestamp: daysAgo(3), invoiceId: and107InvId }),
    jEv(and107.id, 'laboratoire', 'Résultats validés', 'analyses_complete', 'NFS (2 anormaux) + Bilan lipidique (2 anormaux)', 'Thomas Nguyen', { timestamp: daysAgo(3), labRequestId: and107NfsId }),
    jEv(rab108.id, 'reception', 'Enregistrement patient', 'registered', `Dossier RAB108 créé`, 'Réception', { timestamp: daysAgo(0) }),
    jEv(rab108.id, 'consultation', 'Consultation terminée', 'consulted_awaiting_payment', 'Dr. Ahmed Benali — Hypertension', 'Dr. Ahmed Benali', { timestamp: daysAgo(0), consultationId: rab108Consult.id }),
    jEv(rab108.id, 'laboratoire', 'Demande d\'analyse', 'analyses_pending', 'Créatinine, Urée — à facturer', 'Dr. Ahmed Benali', { timestamp: daysAgo(0), labRequestId: rab108ReqId, consultationId: rab108Consult.id }),
  ];

  return {
    currentUser: null,
    ticketSettings: {
      facilityName: 'RÉCEPTION SALFA', address: 'Madagascar', phone: '', nif: '', email: '', website: '',
      logoUrl: '', receiptTitle: 'REÇU DE PAIEMENT', footerMessage: 'Merci de votre confiance. À bientôt !',
      paperWidth: 80, autoPrint: true, showLogo: true, showBarcode: true, showSignature: true,
      copies: 1, currency: 'Ar', paymentMethods: ['Espèces', 'Carte bancaire', 'Mobile Money', 'Virement', 'Chèque'],
      invoicePrefix: 'FAC', ticketFooter2: '', ticketHeaderColor: '#1e40af',
    },
    patients: [...seedPatients, lea, ...demoPatients, ...morePatients], consultations: [leaConsult, ...demoConsultations], invoices: [leaInvoice, leaLabInvoice, ...demoInvoices], cashClosings: [],
    articles: [...seedArticles],
    stockTransfers: [], stockEntries: [], auditLogs: [], notifications: [],
    messages: [], users: [...users], companies: [...seedCompanies],
    fournisseurs: [...SEED_FOURNISSEURS],
    familles: [...SEED_FAMILLES],
    journey: [...baseJourney, ...leaJourney, ...demoJourney],
    labRequests: [...leaLabRequests, ...demoLabs],
    labCatalog: [...seedLabCatalog],
    warehouseServices: SEED_WAREHOUSE_SERVICES.map(s => ({ ...s })),
    stockMovements: [],
    inventorySessions: [],
    movementHeaders: [],
    movementLines: [],
  };
}

export function addAuditLog(s: AppState, action: string, details: string, patientId?: string): AuditLog {
  const l: AuditLog = { id: uuidv4(), timestamp: new Date().toISOString(), userId: s.currentUser?.id || 'SYSTEM', userName: s.currentUser?.name || 'Système', userRole: s.currentUser?.role || 'receptionist', action, details, patientId };
  s.auditLogs.unshift(l); return l;
}
export function addNotification(s: AppState, targetRole: UserRole, message: string, type: 'info'|'warning'|'critical' = 'info', targetUserId?: string): Notification {
  const n: Notification = { id: uuidv4(), targetRole, targetUserId, message, type, timestamp: new Date().toISOString(), read: false };
  s.notifications.unshift(n); return n;
}

export const ARTICLE_FAMILIES: ArticleFamily[] = ['MEDIC','LABO','DENT','ECHO'];
export function familyLabel(f: ArticleFamily): string { return { MEDIC:'Médicaments', LABO:'Laboratoire', DENT:'Dentaire', ECHO:'Échographie' }[f]; }

export const TRANSFER_CATEGORIES: TransferCategory[] = ['central', 'hospitalisation', 'bloc', 'approvisionnement'];
export function transferCategoryLabel(c: TransferCategory): string {
  return { central:'Achat Central', hospitalisation:'Achat Bloc Hosp', bloc:'Achat Bloc', approvisionnement:'Achat Approvis' }[c];
}
export function transferCategoryColor(c: TransferCategory): string {
  return { central:'bg-sky-100 text-sky-700', hospitalisation:'bg-rose-100 text-rose-700', bloc:'bg-blue-100 text-blue-700', approvisionnement:'bg-purple-100 text-purple-700' }[c];
}
export const SPECIALTIES = ['Médecine Générale','Cardiologie','Chirurgie','Pédiatrie','Gynécologie','Neurologie','Orthopédie','Dermatologie','ORL','Ophtalmologie'];
export const LAB_EXAMS = [
  { name: 'NFS', parameters: ['Globules Rouges','Globules Blancs','Hémoglobine','Plaquettes','Hématocrite'] },
  { name: 'Glycémie à jeun', parameters: ['Glucose'] },
  { name: 'Bilan lipidique', parameters: ['Cholestérol Total','HDL','LDL','Triglycérides'] },
  { name: 'Bilan hépatique', parameters: ['ASAT','ALAT','GGT','Bilirubine'] },
  { name: 'Bilan rénal', parameters: ['Créatinine','Urée','Acide Urique'] },
  { name: 'CRP', parameters: ['CRP'] },
  { name: 'Groupe Sanguin', parameters: ['Groupe ABO','Rhésus'] },
];
export const LAB_NORMS: Record<string,{min:number;max:number;unit:string}> = {
  'Globules Rouges':{min:4.0,max:5.5,unit:'T/L'},'Globules Blancs':{min:4.0,max:10.0,unit:'G/L'},
  'Hémoglobine':{min:12.0,max:17.0,unit:'g/dL'},'Plaquettes':{min:150,max:400,unit:'G/L'},
  'Hématocrite':{min:36,max:50,unit:'%'},'Glucose':{min:0.7,max:1.1,unit:'g/L'},
  'Cholestérol Total':{min:1.5,max:2.0,unit:'g/L'},'HDL':{min:0.4,max:0.6,unit:'g/L'},
  'LDL':{min:0.7,max:1.6,unit:'g/L'},'Triglycérides':{min:0.5,max:1.5,unit:'g/L'},
  'ASAT':{min:5,max:40,unit:'UI/L'},'ALAT':{min:5,max:40,unit:'UI/L'},
  'GGT':{min:5,max:55,unit:'UI/L'},'Bilirubine':{min:3,max:12,unit:'mg/L'},
  'Créatinine':{min:6,max:12,unit:'mg/L'},'Urée':{min:0.15,max:0.45,unit:'g/L'},
  'Acide Urique':{min:25,max:70,unit:'mg/L'},'CRP':{min:0,max:5,unit:'mg/L'},
  'Sodium':{min:135,max:145,unit:'mmol/L'},'Potassium':{min:3.5,max:5.1,unit:'mmol/L'},'Chlore':{min:98,max:107,unit:'mmol/L'},
  'INR':{min:0.8,max:1.2,unit:''},'TP':{min:70,max:100,unit:'%'},'TCA':{min:24,max:36,unit:'s'},
  'TSH':{min:0.4,max:4.0,unit:'mUI/L'},'IgE':{min:0,max:100,unit:'kU/L'},
};

/* ====== CATALOGUE LABORATOIRE ====== */
export const LAB_CATEGORIES: LabCategory[] = [
  'hematologie', 'biochimie', 'serologie', 'bacteriologie', 'parasitologie', 'immunologie', 'hemostase', 'autre',
];
export function labCategoryLabel(c: LabCategory): string {
  return {
    hematologie: 'Hématologie', biochimie: 'Biochimie', serologie: 'Sérologie',
    bacteriologie: 'Bactériologie', parasitologie: 'Parasitologie', immunologie: 'Immunologie',
    hemostase: 'Hémostase', autre: 'Autre',
  }[c];
}

export const seedLabCatalog: LabExamCatalog[] = [
  // Hématologie
  { id: uuidv4(), code: 'HEM001', name: 'NFS', category: 'hematologie', parameters: ['Globules Rouges', 'Globules Blancs', 'Hémoglobine', 'Plaquettes', 'Hématocrite'], sampleType: 'Sang veineux (EDTA)', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 25000, durationHours: 4 },
  { id: uuidv4(), code: 'HEM002', name: 'Groupe Sanguin & Rhésus', category: 'hematologie', parameters: ['Groupe ABO', 'Rhésus'], sampleType: 'Sang veineux', priceComptoir: 10000, priceSociete: 9000, priceExterne: 12000, urgentPrice: 15000, durationHours: 2 },
  { id: uuidv4(), code: 'HEM003', name: 'Réticulocytes', category: 'hematologie', parameters: ['Réticulocytes'], sampleType: 'Sang veineux (EDTA)', priceComptoir: 12000, priceSociete: 11000, priceExterne: 14000, urgentPrice: 20000, durationHours: 3 },
  { id: uuidv4(), code: 'HEM004', name: 'TP / INR', category: 'hemostase', parameters: ['TP', 'INR'], sampleType: 'Sang veineux (citraté)', priceComptoir: 12000, priceSociete: 11000, priceExterne: 15000, urgentPrice: 20000, durationHours: 2 },
  { id: uuidv4(), code: 'HEM005', name: 'TCA', category: 'hemostase', parameters: ['TCA'], sampleType: 'Sang veineux (citraté)', priceComptoir: 12000, priceSociete: 11000, priceExterne: 15000, urgentPrice: 20000, durationHours: 3 },
  // Biochimie
  { id: uuidv4(), code: 'BIO001', name: 'Glycémie à jeun', category: 'biochimie', parameters: ['Glucose'], sampleType: 'Sang veineux', priceComptoir: 8000, priceSociete: 7000, priceExterne: 10000, urgentPrice: 15000, durationHours: 1 },
  { id: uuidv4(), code: 'BIO002', name: 'Créatinine', category: 'biochimie', parameters: ['Créatinine'], sampleType: 'Sang veineux', priceComptoir: 10000, priceSociete: 9000, priceExterne: 12000, urgentPrice: 18000, durationHours: 2 },
  { id: uuidv4(), code: 'BIO003', name: 'Bilan hépatique', category: 'biochimie', parameters: ['ASAT', 'ALAT', 'GGT', 'Bilirubine'], sampleType: 'Sang veineux', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 40000, durationHours: 4 },
  { id: uuidv4(), code: 'BIO004', name: 'Ionogramme (Na/K/Cl)', category: 'biochimie', parameters: ['Sodium', 'Potassium', 'Chlore'], sampleType: 'Sang veineux', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 25000, durationHours: 2 },
  { id: uuidv4(), code: 'BIO005', name: 'Bilan lipidique', category: 'biochimie', parameters: ['Cholestérol Total', 'HDL', 'LDL', 'Triglycérides'], sampleType: 'Sang veineux', priceComptoir: 20000, priceSociete: 18000, priceExterne: 25000, urgentPrice: 35000, durationHours: 4 },
  { id: uuidv4(), code: 'BIO006', name: 'Urée', category: 'biochimie', parameters: ['Urée'], sampleType: 'Sang veineux', priceComptoir: 9000, priceSociete: 8000, priceExterne: 11000, urgentPrice: 16000, durationHours: 2 },
  { id: uuidv4(), code: 'BIO007', name: 'Acide Urique', category: 'biochimie', parameters: ['Acide Urique'], sampleType: 'Sang veineux', priceComptoir: 9000, priceSociete: 8000, priceExterne: 11000, urgentPrice: 16000, durationHours: 2 },
  { id: uuidv4(), code: 'BIO008', name: 'CRP', category: 'biochimie', parameters: ['CRP'], sampleType: 'Sang veineux', priceComptoir: 7000, priceSociete: 6000, priceExterne: 9000, urgentPrice: 12000, durationHours: 1 },
  // Sérologie
  { id: uuidv4(), code: 'SER001', name: 'Sérologie VIH', category: 'serologie', parameters: ['VIH'], sampleType: 'Sang (sérum)', priceComptoir: 20000, priceSociete: 18000, priceExterne: 25000, urgentPrice: 30000, durationHours: 24 },
  { id: uuidv4(), code: 'SER002', name: 'Sérologie HBs (Hépatite B)', category: 'serologie', parameters: ['HBs'], sampleType: 'Sang (sérum)', priceComptoir: 18000, priceSociete: 16000, priceExterne: 22000, urgentPrice: 28000, durationHours: 24 },
  { id: uuidv4(), code: 'SER003', name: 'Dengue IgM/IgG', category: 'serologie', parameters: ['Dengue IgM/IgG'], sampleType: 'Sang (sérum)', priceComptoir: 22000, priceSociete: 20000, priceExterne: 28000, urgentPrice: 35000, durationHours: 24 },
  { id: uuidv4(), code: 'SER004', name: 'COVID-19 (PCR)', category: 'serologie', parameters: ['SARS-CoV-2'], sampleType: 'Prélèvement nasopharyngé', priceComptoir: 35000, priceSociete: 32000, priceExterne: 45000, urgentPrice: 50000, durationHours: 6 },
  // Bactériologie
  { id: uuidv4(), code: 'BAC001', name: 'ECBU (Culture + Antibiogramme)', category: 'bacteriologie', parameters: ['Culture', 'Antibiogramme'], sampleType: 'Urine (pot stérile)', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 25000, durationHours: 48 },
  { id: uuidv4(), code: 'BAC002', name: 'Hémocultures', category: 'bacteriologie', parameters: ['Culture'], sampleType: 'Sang veineux', priceComptoir: 20000, priceSociete: 18000, priceExterne: 25000, urgentPrice: 30000, durationHours: 72 },
  // Parasitologie
  { id: uuidv4(), code: 'PAR001', name: 'Goutte épaisse', category: 'parasitologie', parameters: ['Plasmodium'], sampleType: 'Sang veineux', priceComptoir: 10000, priceSociete: 9000, priceExterne: 12000, urgentPrice: 18000, durationHours: 4 },
  { id: uuidv4(), code: 'PAR002', name: 'Coprologie', category: 'parasitologie', parameters: ['Parasites', 'Candida'], sampleType: 'Selles (pot propre)', priceComptoir: 8000, priceSociete: 7000, priceExterne: 10000, urgentPrice: 15000, durationHours: 24 },
  // Immunologie
  { id: uuidv4(), code: 'IMM001', name: 'TSH', category: 'immunologie', parameters: ['TSH'], sampleType: 'Sang (sérum)', priceComptoir: 18000, priceSociete: 16000, priceExterne: 22000, urgentPrice: 28000, durationHours: 24 },
  { id: uuidv4(), code: 'IMM002', name: 'IgE totales', category: 'immunologie', parameters: ['IgE'], sampleType: 'Sang (sérum)', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 24000, durationHours: 24 },
];

/** Ajoute un événement au parcours patient (timeline). */
export function addJourneyEvent(
  s: AppState,
  e: {
    patientId: string; department: JourneyDepartment; action: string;
    status?: string; details?: string; actorId?: string; actorName?: string;
    consultationId?: string; invoiceId?: string; labRequestId?: string; hospitalizationId?: string;
    timestamp?: string;
  },
): PatientJourneyEvent {
  const ev: PatientJourneyEvent = {
    id: uuidv4(),
    timestamp: e.timestamp || new Date().toISOString(),
    patientId: e.patientId, department: e.department, action: e.action,
    status: e.status, details: e.details, actorId: e.actorId, actorName: e.actorName,
    consultationId: e.consultationId, invoiceId: e.invoiceId,
    labRequestId: e.labRequestId, hospitalizationId: e.hospitalizationId,
  };
  s.journey.unshift(ev);
  return ev;
}
