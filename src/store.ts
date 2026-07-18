import { v4 as uuidv4 } from 'uuid';
import type {
  Patient, Consultation, Invoice, Article, Bed, AuditLog,
  Notification, HospitalizationRecord, UserRole, User, Company,
  Message, StockTransfer, StockEntry, ClientType, ArticleFamily, TransferCategory
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

const seedBeds: Bed[] = [
  { id: uuidv4(), service: 'Médecine Générale', roomNumber: '101', bedNumber: 'A', occupied: false },
  { id: uuidv4(), service: 'Médecine Générale', roomNumber: '101', bedNumber: 'B', occupied: false },
  { id: uuidv4(), service: 'Chirurgie', roomNumber: '201', bedNumber: 'A', occupied: false },
  { id: uuidv4(), service: 'Chirurgie', roomNumber: '201', bedNumber: 'B', occupied: false },
  { id: uuidv4(), service: 'Cardiologie', roomNumber: '301', bedNumber: 'A', occupied: false },
  { id: uuidv4(), service: 'Pédiatrie', roomNumber: '401', bedNumber: 'A', occupied: false },
  { id: uuidv4(), service: 'Réanimation', roomNumber: '501', bedNumber: 'A', occupied: false },
];

const seedCompanies: Company[] = [
  { id: uuidv4(), name: 'JIRAMA' },{ id: uuidv4(), name: 'TELMA' },
  { id: uuidv4(), name: 'AIR MADAGASCAR' },{ id: uuidv4(), name: 'AMBATOVY' },
  { id: uuidv4(), name: 'QMM / RIO TINTO' },{ id: uuidv4(), name: 'STAR BRASSERIES' },
  { id: uuidv4(), name: 'BNI MADAGASCAR' },{ id: uuidv4(), name: 'SOCIMEX' },
];

const seedPatients: Patient[] = [
  { id: uuidv4(), dossier: 'MAR101', firstName: 'Jean', lastName: 'MARTIN', dateOfBirth: '1985-03-15', age: '39 Ans', gender: 'M', address: 'ANTANANARIVO', contact: '034 12 345 67', ssn: '', allergies: ['Pénicilline'], chronicTreatments: ['Amlodipine 5mg'], registeredAt: new Date().toISOString(), registeredBy: 'SYSTEM', status: 'registered', clientType: 'comptoir' },
  { id: uuidv4(), dossier: 'DUP102', firstName: 'Marie', lastName: 'DUPONT', dateOfBirth: '1990-07-22', age: '34 Ans', gender: 'F', address: 'TOAMASINA', contact: '033 98 765 43', ssn: '', allergies: [], chronicTreatments: [], registeredAt: new Date().toISOString(), registeredBy: 'SYSTEM', status: 'registered', clientType: 'societe', company: 'JIRAMA', subCompany: 'Direction Régionale' },
  { id: uuidv4(), dossier: 'RAK103', firstName: 'Solo', lastName: 'RAKOTO', dateOfBirth: '2015-11-08', age: '9 Ans', gender: 'M', address: 'FIANARANTSOA', contact: '032 11 222 33', ssn: '', insureName: 'RAKOTO JEAN', allergies: ['Aspirine'], chronicTreatments: [], registeredAt: new Date().toISOString(), registeredBy: 'SYSTEM', status: 'registered', clientType: 'comptoir' },
];

const users: User[] = [
  { id: 'DOC001', name: 'Dr. Jean Martin', role: 'doctor', password: 'doc123' },
  { id: 'DOC002', name: 'Dr. Sophie Leclerc', role: 'doctor', password: 'doc123' },
  { id: 'DOC003', name: 'Dr. Ahmed Benali', role: 'doctor', password: 'doc123' },
  { id: 'CAS001', name: 'Pierre Duval', role: 'cashier', password: 'caisse123' },
  { id: 'PHA001', name: 'Fatima Benali', role: 'pharmacy', password: 'pharma123' },
  { id: 'MAG001', name: 'Ali Rasolofo', role: 'magasinier', password: 'mag123' },
  { id: 'LAB001', name: 'Thomas Nguyen', role: 'laboratory', password: 'labo123' },
  { id: 'HOS001', name: 'Claire Moreau', role: 'hospitalization', password: 'hosp123' },
  { id: 'ADM001', name: 'Admin Système', role: 'admin', password: 'admin123' },
];

export const CONSULTATION_FEE = 10000;
export const LAB_FEE = 15000;
export const LAB_FEE_URGENT = 25000;
export const SURGERY_FEE = 500000;
export const HOSPITALIZATION_FEE = 80000;

export interface AppState {
  currentUser: User | null; ticketSettings: import('./types').TicketSettings; patients: Patient[]; consultations: Consultation[];
  invoices: Invoice[]; articles: Article[]; beds: Bed[];
  hospitalizations: HospitalizationRecord[]; stockTransfers: StockTransfer[];
  stockEntries: StockEntry[]; auditLogs: AuditLog[]; notifications: Notification[];
  messages: Message[]; users: User[]; companies: Company[];
}

export function createInitialState(): AppState {
  return {
    currentUser: null,
    ticketSettings: {
      facilityName: 'RÉCEPTION SALFA', address: 'Madagascar', phone: '', nif: '', email: '', website: '',
      logoUrl: '', receiptTitle: 'REÇU DE PAIEMENT', footerMessage: 'Merci de votre confiance. À bientôt !',
      paperWidth: 80, autoPrint: true, showLogo: true, showBarcode: true, showSignature: true,
      copies: 1, currency: 'Ar', paymentMethods: ['Espèces', 'Carte bancaire', 'Mobile Money', 'Virement', 'Chèque'],
      invoicePrefix: 'FAC', ticketFooter2: '', ticketHeaderColor: '#1e40af',
    },
    patients: [...seedPatients], consultations: [], invoices: [],
    articles: [...seedArticles], beds: [...seedBeds], hospitalizations: [],
    stockTransfers: [], stockEntries: [], auditLogs: [], notifications: [],
    messages: [], users: [...users], companies: [...seedCompanies],
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
};
