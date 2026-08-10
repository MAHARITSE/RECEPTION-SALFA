import { v4 as uuidv4 } from 'uuid';
import type {
  Patient, Consultation, Invoice, CashClosing, Article, AuditLog, VitalSigns, Prescription,
  Notification, UserRole, User, Company, Fournisseur, Famille,
  Message, StockTransfer, StockEntry, ClientType, ArticleFamily, TransferCategory,
  LabExamCatalog, LabCategory, LabRequest, PatientJourneyEvent, JourneyDepartment,
  WarehouseService, StockMovement, InventorySession, StockLocation,
  MovementHeader, MovementLine, MovementType, Vente, VenteLine, VentePayment, VenteType, CompanyBillingAccount,
  TicketSettings,
} from './types';
import localSeedData from './data/localData.json';

let dossierCounter = 100;
export function generateDossierNumber(ln: string): string { dossierCounter++; return `${ln.substring(0,3).toUpperCase().padEnd(3,'X')}${dossierCounter}`; }
export function calculateAge(bd: string): string {
  if (!bd || bd === 'N/A') return 'N/A';
  const t = new Date(), b = new Date(bd); let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() - b.getMonth() < 0 || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  if (a < 1) return `${(t.getFullYear()-b.getFullYear())*12+t.getMonth()-b.getMonth()} Mois`;
  return `${a} Ans`;
}
export function formatAr(n: number): string {
  return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Ar';
}
export function formatMoney(n: number, currency: string = 'Ar'): string {
  return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}
export function formatNum(n: number): string {
  return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function roundTo2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}
export function getPrice(a: Article, ct: ClientType): number {
  if (ct === 'societe') return a.priceSociete;
  if (ct === 'externe') return a.priceExterne;
  return a.priceComptoir;
}

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

/** Article en rupture de stock pharmacie — listé en rouge dans la saisie assistée des ventes, non vendable */
export function isOutOfStockPharma(a: Article): boolean {
  return a.stockPharmacie <= 0;
}

/** Statut d'alerte stock d'un dépôt :
 *  - 'off' : alertes désactivées pour ce dépôt (aucun badge / notification)
 *  - 'out' : rupture (stock ≤ 0)
 *  - 'low' : stock bas (stock ≤ stock d'alerte)
 *  - 'ok'  : stock suffisant */
export function stockAlertStatus(a: Article, location: 'central' | 'pharmacie'): 'off' | 'out' | 'low' | 'ok' {
  const disabled = location === 'central' ? a.alertDisabledCentral : a.alertDisabledPharmacie;
  if (disabled) return 'off';
  const stock = location === 'central' ? a.stockCentral : a.stockPharmacie;
  const min = location === 'central' ? a.minStockCentral : a.minStockPharmacie;
  if (stock <= 0) return 'out';
  if (stock <= min) return 'low';
  return 'ok';
}

/* ====== NUMÉROTATION DES FACTURES ====== */
/** Construit un numéro de facture de la forme "FAC-YYYY-NNNN" en utilisant le compteur persistant. */
export function generateFactureNumber(prefix: string = 'FAC', counter: number = 1): string {
  const year = new Date().getFullYear();
  const seq = String(counter).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

/** Construit un numéro de clôture de livraison pharmacie de la forme "LIV-YYYY-NNNN". */
export function generatePharmaClosingNumber(counter: number = 1): string {
  const year = new Date().getFullYear();
  const seq = String(counter).padStart(4, '0');
  return `LIV-${year}-${seq}`;
}

/* ====== HELPERS VENTES UNIFIÉES ====== */

/** Calcule le montant HT d'une ligne (avant remise). */
export function ligneVenteSubtotal(line: Pick<VenteLine, 'quantity' | 'unitPrice'>): number {
  return (line.quantity || 0) * (line.unitPrice || 0);
}

/** Calcule le montant net d'une ligne après remise. */
export function ligneVenteNet(line: Pick<VenteLine, 'quantity' | 'unitPrice' | 'discount'>): number {
  const base = ligneVenteSubtotal(line);
  const rem = (line.discount || 0) / 100;
  return roundTo2(base * (1 - rem));
}

/** Calcule les totaux d'une vente à partir de ses lignes + remise globale. */
export function computeVenteTotals(
  lines: Pick<VenteLine, 'quantity' | 'unitPrice' | 'discount'>[],
  globalRemisePct: number = 0,
): { subtotal: number; remiseMontant: number; montantFacture: number } {
  const subtotal = lines.reduce((s, l) => s + ligneVenteSubtotal(l), 0);
  const remiseLignes = lines.reduce((s, l) => s + (ligneVenteSubtotal(l) - ligneVenteNet(l)), 0);
  const baseApresRemiseLignes = subtotal - remiseLignes;
  const remiseGlobale = roundTo2(baseApresRemiseLignes * ((globalRemisePct || 0) / 100));
  const montantFacture = Math.max(0, roundTo2(baseApresRemiseLignes - remiseGlobale));
  return {
    subtotal,
    remiseMontant: roundTo2(remiseLignes + remiseGlobale),
    montantFacture,
  };
}

/** Crée une vente unifiée avec ses lignes. Alimente automatiquement les totaux. */
export function createVente(
  state: AppState,
  data: Omit<Vente, 'id' | 'createdAt' | 'numeroFacture' | 'subtotal' | 'remiseMontant' | 'montantFacture' | 'montantPaye' | 'status'> & { numeroFacture?: string; montantPaye?: number },
  lines: Array<Omit<VenteLine, 'id' | 'venteId'>>,
): { vente: Vente; venteLines: VenteLine[] } {
  const now = new Date().toISOString();
  const venteId = uuidv4();
  const tot = computeVenteTotals(lines, data.remisePct || 0);

  state.factureCounter = (state.factureCounter || 0) + 1;
  const numeroFacture = data.numeroFacture || generateFactureNumber(
    state.ticketSettings?.invoicePrefix || 'FAC',
    state.factureCounter,
  );

  const montantPaye = data.montantPaye ?? 0;
  let status: Vente['status'] = 'pending';
  if (montantPaye >= tot.montantFacture && tot.montantFacture > 0) status = 'paid';
  else if (montantPaye > 0) status = 'partiel';

  const vente: Vente = {
    ...data,
    id: venteId,
    numeroFacture,
    subtotal: tot.subtotal,
    remiseMontant: tot.remiseMontant,
    montantFacture: tot.montantFacture,
    montantPaye,
    status,
    isExterne: data.isExterne ?? data.type === 'externe',
    source: data.source || 'caisse',
    dateVente: data.dateVente || now,
    createdAt: now,
  };

  const venteLines: VenteLine[] = lines.map(l => ({
    id: uuidv4(),
    venteId,
    ...l,
  }));

  state.ventes = [...(state.ventes || []), vente];
  state.venteLines = [...(state.venteLines || []), ...venteLines];

  return { vente, venteLines };
}

/** Enregistre un paiement sur une vente (paiement partiel ou complet). */
export function addVentePayment(
  state: AppState,
  venteId: string,
  payment: { amount: number; method?: VentePayment['method']; date?: string; paidBy: string; paidByUserId?: string; reference?: string },
): VentePayment | null {
  const v = state.ventes.find(x => x.id === venteId);
  if (!v) return null;
  const pay: VentePayment = {
    id: uuidv4(),
    venteId,
    amount: payment.amount,
    method: payment.method || 'Espèces',
    date: payment.date || new Date().toISOString(),
    paidBy: payment.paidBy,
    paidByUserId: payment.paidByUserId,
    reference: payment.reference,
  };
  state.ventePayments = [...(state.ventePayments || []), pay];

  const montantPaye = (v.montantPaye || 0) + payment.amount;
  let status: Vente['status'] = v.status;
  let paidAt = v.paidAt;
  let datePaiement = v.datePaiement;
  if (montantPaye >= v.montantFacture) {
    status = 'paid';
    paidAt = paidAt || pay.date;
  } else if (montantPaye > 0) {
    status = 'partiel';
    datePaiement = datePaiement || pay.date;
  }
  state.ventes = state.ventes.map(x => x.id === venteId
    ? { ...x, montantPaye, status, paidAt, datePaiement, paidBy: pay.paidByUserId, paidByName: pay.paidBy }
    : x);
  return pay;
}

/** Récupère les lignes d'une vente. */
export function getVenteLines(state: AppState, venteId: string): VenteLine[] {
  return (state.venteLines || []).filter(l => l.venteId === venteId);
}

/** Récupère les paiements d'une vente. */
export function getVentePayments(state: AppState, venteId: string): VentePayment[] {
  return (state.ventePayments || []).filter(p => p.venteId === venteId);
}

/**
 * Vrai uniquement lorsque les lignes de prescription d'une consultation ont fait
 * l'objet d'un paiement effectif. Cette règle sert de garde unique avant tout
 * affichage de données d'ordonnance (article, quantité, posologie, prix).
 */
export function isPrescriptionPaid(state: AppState, consultationId?: string): boolean {
  if (!consultationId) return false;
  const paidLegacyInvoice = state.invoices.some((inv) =>
    inv.consultationId === consultationId &&
    inv.status === 'paid' &&
    inv.items.some((it) => it.category === 'pharmacy')
  );
  if (paidLegacyInvoice) return true;

  return (state.ventes || []).some((v) =>
    v.consultationId === consultationId &&
    v.status === 'paid' &&
    (state.venteLines || []).some((l) => l.venteId === v.id && l.category === 'pharmacy')
  );
}

/** Retourne les prescriptions uniquement si elles sont payées ; sinon tableau vide. */
export function paidPrescriptionsForConsultation(state: AppState, consultation: Pick<Consultation, 'id' | 'prescriptions'>): Prescription[] {
  return isPrescriptionPaid(state, consultation.id) ? consultation.prescriptions : [];
}

/** Masque les désignations de prescription sur une facture non réglée. */
export function safeInvoiceItemDescriptions(invoice: Pick<Invoice, 'items' | 'status'>, paidOverride?: boolean): string[] {
  const paid = paidOverride ?? invoice.status === 'paid';
  return invoice.items.map((it) => {
    if (it.category === 'pharmacy' && !paid) return 'Prescription masquée — paiement requis';
    return it.description;
  });
}

/** Migre les anciennes factures (`invoices`) et dossiers hospit/bloc (`hbRecords`)
 *  vers la table unifiée `ventes` + `venteLines` (+ `ventePayments` pour les paiements partiels).
 *  S'exécute de manière idempotente : une fois la migration faite, rien n'est dupliqué. */
export function migrateLegacyToVentes(state: AppState): { migratedInvoices: number; migratedHb: number } {
  let migratedInvoices = 0;
  let migratedHb = 0;
  const existingInvIds = new Set((state.ventes || []).map(v => v.legacyInvoiceId).filter(Boolean) as string[]);
  const existingHbIds = new Set((state.ventes || []).map(v => v.legacyHbRecordId).filter(Boolean) as string[]);

  const newVentes: Vente[] = [];
  const newLines: VenteLine[] = [];
  const newPaiments: VentePayment[] = [];
  let counter = state.factureCounter || 0;

  for (const inv of state.invoices) {
    if (existingInvIds.has(inv.id)) continue;
    counter++;
    const vtype: VenteType = inv.isExternal ? 'externe'
      : inv.items.some(i => i.category === 'lab') ? 'labo'
      : inv.items.some(i => i.category === 'echo') ? 'echo'
      : inv.items.some(i => i.category === 'hospitalization' || i.category === 'surgery') ? 'hospitalisation'
      : inv.items.some(i => i.category === 'pharmacy') ? 'pharmacie'
      : 'consultation';
    const venteId = uuidv4();
    const num = generateFactureNumber(state.ticketSettings?.invoicePrefix || 'FAC', counter);
    const vente: Vente = {
      id: venteId,
      patientId: inv.patientId,
      consultationId: inv.consultationId,
      numeroFacture: num,
      type: vtype,
      clientType: inv.clientType,
      clientName: inv.clientName,
      subtotal: inv.totalAmount,
      remisePct: 0,
      remiseMontant: 0,
      montantFacture: inv.totalAmount,
      montantPaye: inv.status === 'paid' ? inv.totalAmount : 0,
      status: inv.status === 'paid' ? 'paid' : 'pending',
      isExterne: !!inv.isExternal,
      source: 'caisse',
      dateVente: inv.createdAt,
      datePaiement: inv.paidAt,
      paidAt: inv.paidAt,
      paidBy: inv.paidBy,
      createdAt: inv.createdAt,
      closingId: inv.closingId,
      legacyInvoiceId: inv.id,
    };
    newVentes.push(vente);
    newLines.push(...inv.items.map((it, idx) => ({
      id: uuidv4(),
      venteId,
      articleName: it.description,
      quantity: 1,
      unitPrice: it.amount,
      discount: 0,
      category: it.category as VenteLine['category'],
      dateSort: inv.createdAt.substring(0, 10),
    })));
    migratedInvoices++;
  }

  for (const hb of state.hbRecords) {
    if (existingHbIds.has(hb.id)) continue;
    counter++;
    const vtype: VenteType = hb.type === 'hospit' ? 'hospitalisation' : 'bloc';
    const venteId = uuidv4();
    const num = generateFactureNumber(state.ticketSettings?.invoicePrefix || 'FAC', counter);
    const tot = computeVenteTotals(hb.lines.map(l => ({ quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })), 0);
    const totalPaye = hb.payments.reduce((s, p) => s + p.amount, 0);
    const status: Vente['status'] = totalPaye >= tot.montantFacture && tot.montantFacture > 0 ? 'paid'
      : totalPaye > 0 ? 'partiel' : 'pending';
    const patient = hb.patientId ? state.patients.find(p => p.id === hb.patientId) : undefined;
    const vente: Vente = {
      id: venteId,
      patientId: hb.patientId,
      numeroFacture: num,
      type: vtype,
      clientType: hb.clientType,
      clientName: patient ? `${patient.firstName} ${patient.lastName}` : hb.patientName,
      company: hb.company,
      subtotal: tot.subtotal,
      remisePct: 0,
      remiseMontant: tot.remiseMontant,
      montantFacture: tot.montantFacture,
      montantPaye: totalPaye,
      status,
      isExterne: false,
      source: 'caisse',
      dateVente: hb.openedAt || new Date().toISOString(),
      datePaiement: hb.payments[0]?.date,
      paidAt: status === 'paid' ? hb.payments[hb.payments.length - 1]?.date : undefined,
      createdAt: hb.openedAt || new Date().toISOString(),
      legacyHbRecordId: hb.id,
    };
    newVentes.push(vente);
    newLines.push(...hb.lines.map(l => ({
      id: uuidv4(),
      venteId,
      articleName: l.articleName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      category: (vtype === 'bloc' ? 'bloc' : 'hospitalization') as VenteLine['category'],
      dateSort: l.dateSort,
    })));
    newPaiments.push(...hb.payments.map(p => ({
      id: uuidv4(),
      venteId,
      amount: p.amount,
      method: 'Espèces' as VentePayment['method'],
      date: p.date,
      paidBy: p.paidBy,
      paidByUserId: p.paidByUserId,
    })));
    migratedHb++;
  }

  state.ventes = [...(state.ventes || []), ...newVentes];
  state.venteLines = [...(state.venteLines || []), ...newLines];
  state.ventePayments = [...(state.ventePayments || []), ...newPaiments];
  state.factureCounter = counter;

  return { migratedInvoices, migratedHb };
}


export const CONSULTATION_FEE = 10000;
export const LAB_FEE = 15000;
export const LAB_FEE_URGENT = 25000;
export const SURGERY_FEE = 500000;

export interface AppState {
  currentUser: User | null; ticketSettings: import('./types').TicketSettings; patients: Patient[]; consultations: Consultation[];
  invoices: Invoice[]; cashClosings: CashClosing[]; articles: Article[];
  stockTransfers: StockTransfer[];
  stockEntries: StockEntry[]; auditLogs: AuditLog[]; notifications: Notification[];
  messages: Message[]; users: User[]; companies: Company[];
  /** Regroupements mensuels des factures société et suivi des règlements. */
  companyBillingAccounts: CompanyBillingAccount[];
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
  /** Lignes de livraisons de pharmacie individuelles (ordonnances délivrées, etc.) */
  pharmaDeliveryItems: import('./types').PharmaDeliveryItem[];
  /** Clôtures et compilations des livraisons de garde de la pharmacie */
  pharmaDeliveryClosings: import('./types').PharmaDeliveryClosing[];
  /** Compteur séquentiel des clôtures de livraisons pharmacie */
  pharmaClosingCounter: number;
  /** Dossiers Hospitalisation / Bloc — PARTAGÉS entre Caisse et Pharmacie (caisse de garde).
   *  Peu importe qui saisit (caisse ou pharmacie) : c'est le paiement qui fait foi. */
  hbRecords: import('./types').HbRecord[];
  /** Table unifiée des ventes (toutes sorties : consultation, hospit, bloc, pharmacie, labo, écho, externe). */
  ventes: Vente[];
  /** Lignes de vente (1:N vers ventes). */
  venteLines: VenteLine[];
  /** Paiements rattachés aux ventes (support des paiements partiels). */
  ventePayments: VentePayment[];
  /** Compteur séquentiel des numéros de facture. */
  factureCounter: number;
}

/**
 * Paramètres d'impression / établissement par défaut (codés en dur).
 * Utilisés par la version WAMP (MySQL) lorsqu'aucune valeur n'est encore
 * enregistrée dans la table `parametres_impression` — aucune dépendance
 * au fichier JSON de démonstration.
 */
export const DEFAULT_TICKET_SETTINGS: TicketSettings = {
  facilityName: 'SALFA — Centre de Santé',
  address: 'Antananarivo, Madagascar',
  phone: '',
  nif: '',
  logoUrl: '',
  secondLogoUrl: '',
  receiptTitle: 'REÇU DE PAIEMENT',
  footerMessage: 'Merci de votre visite. Prompt rétablissement !',
  paperWidth: 80,
  autoPrint: true,
  showLogo: true,
  showBarcode: true,
  showSignature: true,
  copies: 1,
  currency: 'Ar',
  paymentMethods: ['Espèces', 'Carte bancaire', 'Mobile Money', 'Virement', 'Chèque'],
  invoicePrefix: 'FAC',
};

/**
 * État de départ vide pour la version WAMP (100 % MySQL) : AUCUNE donnée
 * JSON de démonstration. Seules les familles par défaut et les paramètres
 * d'impression par défaut sont fournis ; les comptes utilisateurs et la
 * configuration viennent du schéma SQL (table `utilisateurs`…).
 */
function createEmptyInitialState(): AppState {
  return {
    currentUser: null,
    ticketSettings: JSON.parse(JSON.stringify(DEFAULT_TICKET_SETTINGS)),
    patients: [],
    consultations: [],
    invoices: [],
    cashClosings: [],
    articles: [],
    stockTransfers: [],
    stockEntries: [],
    auditLogs: [],
    notifications: [],
    messages: [],
    users: [],
    companies: [],
    companyBillingAccounts: [],
    fournisseurs: [],
    familles: JSON.parse(JSON.stringify(DEFAULT_FAMILLES)),
    journey: [],
    labRequests: [],
    labCatalog: [],
    warehouseServices: [],
    stockMovements: [],
    inventorySessions: [],
    movementHeaders: [],
    movementLines: [],
    pharmaDeliveryItems: [],
    pharmaDeliveryClosings: [],
    pharmaClosingCounter: 0,
    hbRecords: [],
    ventes: [],
    venteLines: [],
    ventePayments: [],
    factureCounter: 0,
  };
}

/**
 * État initial de l'application :
 *  - build standard (mémoire / Cloudflare) : chargé depuis le fichier de données
 *    local `src/data/localData.json`, cloné à chaque appel pour toujours repartir
 *    d'une copie vierge (démarrage + « réinitialisation totale » admin) ;
 *  - build WAMP (`VITE_WAMP_MODE=1`, données dans MySQL) : état VIDE — aucune
 *    donnée JSON n'est intégrée ni sauvegardée dans la base.
 */
export function createInitialState(): AppState {
  if (import.meta.env.VITE_WAMP_MODE === '1') {
    return createEmptyInitialState();
  }
  return normalizeFamilyBases(JSON.parse(JSON.stringify(localSeedData)) as AppState);
}

export function addAuditLog(s: AppState, action: string, details: string, patientId?: string): AuditLog {
  const l: AuditLog = { id: uuidv4(), timestamp: new Date().toISOString(), userId: s.currentUser?.id || 'SYSTEM', userName: s.currentUser?.name || 'Système', userRole: s.currentUser?.role || 'receptionist', action, details, patientId };
  s.auditLogs.unshift(l); return l;
}
export function addNotification(s: AppState, targetRole: UserRole, message: string, type: 'info'|'warning'|'critical' = 'info', targetUserId?: string): Notification | null {
  // RÈGLE : Seules les notifications pour la Pharmacie et le Magasinier (ruptures de stock, réapprovisionnement, alertes stock) sont autorisées
  if (targetRole !== 'pharmacy' && targetRole !== 'magasinier') {
    return null;
  }
  const lowerMsg = message.toLowerCase();
  const isStockTopic = [
    'stock', 'rupture', 'appro', 'réappro', 'réapprovisionnement',
    'dépôt', 'central', 'article', 'quantité', 'inventaire', 'livraison', 'fournisseur', 'commande'
  ].some(kw => lowerMsg.includes(kw));

  if (!isStockTopic && !lowerMsg.includes('pharmacie')) {
    return null;
  }

  const n: Notification = { id: uuidv4(), targetRole, targetUserId, message, type, timestamp: new Date().toISOString(), read: false };
  s.notifications.unshift(n); return n;
}

export const DEFAULT_FAMILLES: Famille[] = [
  { id: 'fam-medic', code: 'MEDIC', name: 'Médicaments', color: '#0D47A1', order: 1 },
  { id: 'fam-lab', code: 'LAB', name: 'Laboratoire', color: '#10B981', order: 2 },
  { id: 'fam-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 3 },
  // Conservé pour les données déjà présentes et les consommables dentaires.
  { id: 'fam-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 4 },
];

// Compatibilité : l'ancien code laboratoire était LABO. La nouvelle base demandée utilise LAB.
export function normalizeFamilyCode(code?: string): string {
  const c = (code || '').trim().toUpperCase();
  return c === 'LABO' ? 'LAB' : c;
}

export const ARTICLE_FAMILIES: ArticleFamily[] = DEFAULT_FAMILLES.map((f) => f.code);

export function getArticleFamilyCatalog(familles: Famille[] = []): Famille[] {
  const byCode = new Map<string, Famille>();
  DEFAULT_FAMILLES.forEach((f) => byCode.set(f.code, f));
  familles.forEach((f, idx) => {
    const code = normalizeFamilyCode(f.code);
    if (!code) return;
    byCode.set(code, { ...f, code, order: f.order ?? idx + 1 });
  });
  return Array.from(byCode.values()).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}

export function familyLabel(f: ArticleFamily | string | undefined, familles: Famille[] = []): string {
  const code = normalizeFamilyCode(f);
  const fam = getArticleFamilyCatalog(familles).find((x) => x.code === code);
  return fam?.name || code || '—';
}

export function isLabFamily(code?: string): boolean { return normalizeFamilyCode(code) === 'LAB'; }
export function isEchoFamily(code?: string): boolean { return normalizeFamilyCode(code) === 'ECHO'; }
export function isMedicationEntryFamily(code?: string): boolean { return !isLabFamily(code) && !isEchoFamily(code); }

/**
 * Normalise la base des familles : MEDIC / LAB / ECHO sont toujours présents,
 * LABO est migré vers LAB, et les articles suivent le nouveau code.
 */
export function normalizeFamilyBases(state: AppState): AppState {
  const seen = new Set<string>();
  const normalizedExisting = (state.familles || [])
    .map((f, idx) => ({ ...f, code: normalizeFamilyCode(f.code), order: f.order ?? idx + 1 }))
    .filter((f) => {
      if (!f.code || seen.has(f.code)) return false;
      seen.add(f.code);
      return true;
    });
  const merged = getArticleFamilyCatalog(normalizedExisting).map((f, idx) => ({ ...f, order: idx + 1 }));
  return {
    ...state,
    familles: merged,
    articles: (state.articles || []).map((a) => ({ ...a, family: normalizeFamilyCode(a.family) })),
  };
}

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

/**
 * Retire un passage de la file d'attente sans jamais supprimer le dossier patient.
 * Seules les consultations non encaissées et leurs éléments de facturation en attente
 * sont annulés. Le patient, ses paramètres et l'historique déjà réglé restent accessibles.
 */
export function purgePatientFromQueue(state: AppState, patientId: string): void {
  // Consultations déjà réglées (facture payée liée) — l'historique financier est conservé
  const paidConsultIds = new Set(
    state.invoices
      .filter((i) => i.patientId === patientId && i.status === 'paid' && i.consultationId)
      .map((i) => i.consultationId as string)
  );
  // Factures jamais encaissées : supprimées (aucune écriture de caisse à préserver)
  state.invoices = state.invoices.filter((i) => !(i.patientId === patientId && i.status === 'pending'));
  // Demandes d'analyses non payées : supprimées (elles n'attendent plus en caisse/labo)
  state.labRequests = state.labRequests.filter((lr) => !(lr.patientId === patientId && lr.status === 'pending'));
  // Consultations non réglées : supprimées avec leurs éventuelles demandes labo/écho
  state.consultations = state.consultations.filter((c) => !(c.patientId === patientId && !paidConsultIds.has(c.id)));
  // Miroir unifié des ventes : on ne retire que les ventes encore en attente du patient
  const pendingVenteIds = new Set(state.ventes.filter((v) => v.patientId === patientId && v.status === 'pending').map((v) => v.id));
  state.ventes = state.ventes.filter((v) => !pendingVenteIds.has(v.id));
  state.venteLines = state.venteLines.filter((l) => !pendingVenteIds.has(l.venteId));
  state.ventePayments = state.ventePayments.filter((p) => !pendingVenteIds.has(p.venteId));
  // Le dossier est conservé dans la base : il sort seulement de la file active et ses paramètres vitaux (VitalSigns) sont supprimés.
  state.patients = state.patients.map((p) => p.id === patientId
    ? { ...p, status: 'registered' as const, vitalSigns: undefined, assignedDoctor: undefined, assignedSpecialty: undefined }
    : p);
}

/* ====== FACTURATION SOCIÉTÉS (rôle Responsable facturation) ====== */

/** Libellé d'affichage du statut d'un compte de facturation société. */
export function billingStatusLabel(status: CompanyBillingAccount['status']): string {
  return status === 'paid' ? 'Soldé' : status === 'partial' ? 'Partiellement payé' : 'Impayé';
}

/** Classes Tailwind du badge de statut d'un compte de facturation société. */
export function billingStatusClasses(status: CompanyBillingAccount['status']): string {
  return status === 'paid' ? 'bg-emerald-100 text-emerald-700'
    : status === 'partial' ? 'bg-amber-100 text-amber-700'
    : 'bg-rose-100 text-rose-700';
}

/** Factures d'un mois rattachées à une société (via le dossier patient). */
export function getCompanyInvoicesForMonth(state: AppState, company: string | 'all', month: string): Invoice[] {
  return state.invoices.filter(inv => {
    const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
    if (!patient?.company) return false;
    if (company !== 'all' && patient.company !== company) return false;
    return inv.createdAt.slice(0, 7) === month;
  });
}

/** Numéro de facture unifié (table `ventes`) lié à une facture historique, le cas échéant. */
export function invoiceNumero(state: AppState, invoiceId: string): string {
  return state.ventes.find(v => v.legacyInvoiceId === invoiceId)?.numeroFacture || '—';
}

/** Ajoute un règlement (partiel ou complet) sur un compte de facturation société
 *  et met à jour son statut : impayé → partiellement payé → soldé. */
export function addCompanyBillingPayment(
  state: AppState,
  accountId: string,
  payment: { amount: number; date: string; method: string; reference?: string; receivedBy?: string },
): void {
  state.companyBillingAccounts = state.companyBillingAccounts.map(a => {
    if (a.id !== accountId) return a;
    const paidAmount = a.paidAmount + payment.amount;
    const status: CompanyBillingAccount['status'] = paidAmount >= a.totalAmount ? 'paid' : 'partial';
    return {
      ...a, paidAmount, status,
      payments: [...a.payments, { id: uuidv4(), amount: payment.amount, date: payment.date, method: payment.method, reference: payment.reference, receivedBy: payment.receivedBy }],
    };
  });
}

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
