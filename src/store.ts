import { v4 as uuidv4 } from 'uuid';
import type {
  Patient, Consultation, Invoice, CashClosing, Article, AuditLog, VitalSigns, Prescription,
  Notification, UserRole, User, Company, Fournisseur, Famille,
  Message, StockTransfer, StockEntry, ClientType, ArticleFamily, TransferCategory,
  LabExamCatalog, LabCategory, LabRequest, PatientJourneyEvent, JourneyDepartment,
  WarehouseService, StockMovement, InventorySession, StockLocation,
  MovementHeader, MovementLine, MovementType, Vente, VenteLine, VentePayment, VenteType, CompanyBillingAccount,
  TicketSettings, Etablissement, EtablissementType,
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
  /** Identification de la société / de l'hôpital exploitant (raison sociale, NIF, STAT, agrément…) */
  etablissements: Etablissement[];
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

/* ====== IDENTIFICATION DE LA SOCIÉTÉ / DE L'HÔPITAL (table `etablissements`) ====== */

/** Libellés des natures d'établissement. */
export const ETABLISSEMENT_TYPES: { value: EtablissementType; label: string }[] = [
  { value: 'hopital', label: 'Hôpital' },
  { value: 'clinique', label: 'Clinique' },
  { value: 'centre_sante', label: 'Centre de santé' },
  { value: 'cabinet', label: 'Cabinet médical' },
  { value: 'laboratoire', label: 'Laboratoire d\'analyses' },
  { value: 'pharmacie', label: 'Pharmacie / Dépôt' },
  { value: 'societe', label: 'Société / Entité juridique' },
  { value: 'autre', label: 'Autre' },
];

export function etablissementTypeLabel(t?: EtablissementType | string): string {
  return ETABLISSEMENT_TYPES.find((x) => x.value === t)?.label || 'Autre';
}

/** Établissement de référence (principal actif, sinon 1er actif, sinon 1er). */
export function getEtablissementPrincipal(state: Pick<AppState, 'etablissements'>): Etablissement | undefined {
  const list = state.etablissements || [];
  return list.find((e) => e.isPrincipal && e.active) || list.find((e) => e.active) || list[0];
}

/** Adresse postale complète formatée d'un établissement. */
export function etablissementFullAddress(e?: Etablissement): string {
  if (!e) return '';
  return [e.address, [e.postalCode, e.city].filter(Boolean).join(' '), e.region, e.country]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Crée un établissement complet à partir d'une saisie partielle. */
export function makeEtablissement(data: Partial<Etablissement> = {}): Etablissement {
  const now = new Date().toISOString();
  return {
    id: data.id || uuidv4(),
    code: (data.code || '').trim().toUpperCase(),
    name: (data.name || '').trim(),
    tradeName: data.tradeName,
    type: data.type || 'hopital',
    legalForm: data.legalForm,
    nif: data.nif, stat: data.stat, rcs: data.rcs,
    numeroAgrement: data.numeroAgrement, numeroCnaps: data.numeroCnaps, capital: data.capital,
    address: data.address, city: data.city, postalCode: data.postalCode,
    region: data.region, country: data.country || 'Madagascar',
    phone: data.phone, phone2: data.phone2, fax: data.fax,
    email: data.email, website: data.website,
    directorName: data.directorName, directorTitle: data.directorTitle, directorPhone: data.directorPhone,
    bankName: data.bankName, bankAccount: data.bankAccount,
    logoUrl: data.logoUrl, notes: data.notes,
    active: data.active ?? true,
    isPrincipal: data.isPrincipal ?? false,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

/** Applique les informations d'un établissement sur l'en-tête des documents imprimés. */
export function ticketSettingsFromEtablissement(
  settings: TicketSettings,
  e: Etablissement,
): TicketSettings {
  return {
    ...settings,
    facilityName: e.tradeName?.trim() || e.name,
    address: etablissementFullAddress(e) || settings.address,
    phone: e.phone || settings.phone,
    email: e.email ?? settings.email,
    website: e.website ?? settings.website,
    nif: e.nif || settings.nif,
    logoUrl: e.logoUrl || settings.logoUrl,
  };
}

/**
 * Garantit qu'un seul établissement est marqué principal et que la liste reste
 * cohérente (un principal actif au minimum lorsqu'il existe des lignes).
 */
export function normalizeEtablissements(list: Etablissement[] = []): Etablissement[] {
  if (!list.length) return [];
  let principalFound = false;
  const normalized = list.map((e) => {
    const isPrincipal = !!e.isPrincipal && e.active !== false && !principalFound;
    if (isPrincipal) principalFound = true;
    return { ...e, active: e.active !== false, isPrincipal };
  });
  if (!principalFound) {
    const idx = normalized.findIndex((e) => e.active);
    if (idx >= 0) normalized[idx] = { ...normalized[idx], isPrincipal: true };
  }
  return normalized;
}

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
    etablissements: [],
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
    return ensureEtablissements(createEmptyInitialState());
  }
  return ensureEtablissements(normalizeFamilyBases(JSON.parse(JSON.stringify(localSeedData)) as AppState));
}

/**
 * Garantit la présence de la table `etablissements` : si elle est absente ou
 * vide, une fiche d'identification est créée automatiquement à partir des
 * paramètres d'impression déjà configurés (aucune donnée n'est perdue).
 */
export function ensureEtablissements(state: AppState): AppState {
  const existing = normalizeEtablissements(state.etablissements || []);
  if (existing.length) return { ...state, etablissements: existing };

  const ts = state.ticketSettings || DEFAULT_TICKET_SETTINGS;
  const principal = makeEtablissement({
    code: 'ETB-001',
    name: ts.facilityName || 'Établissement principal',
    tradeName: ts.facilityName,
    type: 'centre_sante',
    nif: ts.nif,
    address: ts.address,
    phone: ts.phone,
    email: ts.email,
    website: ts.website,
    logoUrl: ts.logoUrl,
    active: true,
    isPrincipal: true,
  });
  return { ...state, etablissements: [principal] };
}

export function addAuditLog(s: AppState, action: string, details: string, patientId?: string): AuditLog {
  const l: AuditLog = { id: uuidv4(), timestamp: new Date().toISOString(), userId: s.currentUser?.id || 'SYSTEM', userName: s.currentUser?.name || 'Système', userRole: s.currentUser?.role || 'receptionist', action, details, patientId };
  s.auditLogs.unshift(l); return l;
}
export function addNotification(s: AppState, targetRole: UserRole, message: string, type: 'info'|'warning'|'critical' = 'info', targetUserId?: string): Notification | null {
  // RÈGLE : Seules les notifications pour la Pharmacie et le Magasinier (ruptures de stock, réapprovisionnement, alertes stock) sont autorisées
  if (targetRole !== 'pharmacy' && targetRole !== 'magasinier' && targetRole !== 'cashier') {
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
  { id: 'fam-labo', code: 'LABO', name: 'Laboratoire', color: '#10B981', order: 2 },
  { id: 'fam-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 3 },
  // Conservé pour les données déjà présentes et les consommables dentaires.
  { id: 'fam-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 4 },
];

// Base familles standard : normalise vers majuscules et convertit l'ancien code LAB vers LABO
export function normalizeFamilyCode(code?: string): string {
  const c = (code || '').trim().toUpperCase();
  return c === 'LAB' ? 'LABO' : c;
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

/**
 * La famille gère-t-elle son stock ?
 * Défaut : `true` (gérée) lorsque le drapeau `manageStock` n'est pas renseigné.
 */
export function familyManagesStock(code: string | undefined, familles: Famille[] = []): boolean {
  const c = normalizeFamilyCode(code);
  const fam = getArticleFamilyCatalog(familles).find((x) => x.code === c);
  return fam?.manageStock !== false;
}

export function isLabFamily(code?: string): boolean {
  const c = normalizeFamilyCode(code);
  return c === 'LABO' || c === 'LAB';
}

export function isEchoFamily(code?: string): boolean {
  return normalizeFamilyCode(code) === 'ECHO';
}

export function isMedicationEntryFamily(code?: string): boolean {
  return !isLabFamily(code) && !isEchoFamily(code);
}

/**
 * Normalise la base des familles : MEDIC / LABO / ECHO sont toujours présents,
 * LAB est migré vers LABO, et les articles suivent le code normalisé.
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

export const DEFAULT_LAB_CATALOG: LabExamCatalog[] = [
  { id: 'exam-001', code: 'LAB001', name: 'NFS', category: 'hematologie', parameters: ['Globules Rouges', 'Globules Blancs', 'Hémoglobine', 'Plaquettes', 'Hématocrite'], sampleType: 'Sang veineux (EDTA)', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 25000, durationHours: 4 },
  { id: 'exam-002', code: 'LAB002', name: 'Glycémie à jeun', category: 'biochimie', parameters: ['Glucose'], sampleType: 'Sang veineux', priceComptoir: 8000, priceSociete: 7000, priceExterne: 10000, urgentPrice: 15000, durationHours: 1 },
  { id: 'exam-003', code: 'LAB003', name: 'Créatinine', category: 'biochimie', parameters: ['Créatinine'], sampleType: 'Sang veineux', priceComptoir: 10000, priceSociete: 9000, priceExterne: 12000, urgentPrice: 18000, durationHours: 2 },
  { id: 'exam-004', code: 'LAB004', name: 'CRP', category: 'biochimie', parameters: ['CRP'], sampleType: 'Sang veineux', priceComptoir: 7000, priceSociete: 6000, priceExterne: 9000, urgentPrice: 12000, durationHours: 1 },
  { id: 'exam-005', code: 'LAB005', name: 'Groupe Sanguin & Rhésus', category: 'hematologie', parameters: ['Groupe ABO', 'Rhésus'], sampleType: 'Sang veineux', priceComptoir: 10000, priceSociete: 9000, priceExterne: 12000, urgentPrice: 15000, durationHours: 2 },
  { id: 'exam-006', code: 'LAB006', name: 'ECBU (Culture + Antibiogramme)', category: 'bacteriologie', parameters: ['Culture', 'Antibiogramme'], sampleType: 'Urine (pot stérile)', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 25000, durationHours: 48 },
  { id: 'exam-007', code: 'LAB007', name: 'Goutte épaisse', category: 'parasitologie', parameters: ['Plasmodium'], sampleType: 'Sang veineux', priceComptoir: 10000, priceSociete: 9000, priceExterne: 12000, urgentPrice: 18000, durationHours: 4 },
  { id: 'exam-008', code: 'LAB008', name: 'TP / INR', category: 'hemostase', parameters: ['TP', 'INR'], sampleType: 'Sang veineux (citraté)', priceComptoir: 12000, priceSociete: 11000, priceExterne: 15000, urgentPrice: 20000, durationHours: 2 },
  { id: 'exam-009', code: 'LAB009', name: 'Bilan lipidique complet', category: 'biochimie', parameters: ['Cholestérol Total', 'HDL', 'LDL', 'Triglycérides'], sampleType: 'Sang veineux', priceComptoir: 20000, priceSociete: 18000, priceExterne: 25000, urgentPrice: 30000, durationHours: 2 },
  { id: 'exam-010', code: 'LAB010', name: 'Bilan hépatique complet', category: 'biochimie', parameters: ['ASAT', 'ALAT', 'GGT', 'Bilirubine'], sampleType: 'Sang veineux', priceComptoir: 22000, priceSociete: 20000, priceExterne: 28000, urgentPrice: 35000, durationHours: 2 },
  { id: 'exam-011', code: 'LAB011', name: 'Bilan rénal complet', category: 'biochimie', parameters: ['Créatinine', 'Urée', 'Acide Urique'], sampleType: 'Sang veineux', priceComptoir: 18000, priceSociete: 16000, priceExterne: 22000, urgentPrice: 28000, durationHours: 2 },
  { id: 'exam-012', code: 'LAB012', name: 'Ionogramme sanguin', category: 'biochimie', parameters: ['Sodium', 'Potassium', 'Chlore'], sampleType: 'Sang veineux', priceComptoir: 15000, priceSociete: 13000, priceExterne: 18000, urgentPrice: 22000, durationHours: 2 },
  { id: 'exam-013', code: 'LAB013', name: 'TDR Paludisme', category: 'parasitologie', parameters: ['TDR Paludisme'], sampleType: 'Sang capillaire', priceComptoir: 5000, priceSociete: 4500, priceExterne: 6000, urgentPrice: 8000, durationHours: 1 },
  { id: 'exam-014', code: 'LAB014', name: 'Sérologie VIH / Syphilis', category: 'serologie', parameters: ['VIH 1/2', 'TPHA/VDRL'], sampleType: 'Sang veineux', priceComptoir: 12000, priceSociete: 10000, priceExterne: 15000, urgentPrice: 20000, durationHours: 2 },
];

/* ====== CATALOGUE ÉCHOGRAPHIE ====== */
export interface EchoExamCatalog {
  id: string;
  code: string;
  name: string;
  priceComptoir: number;
  priceSociete: number;
  priceExterne: number;
  urgentPrice: number;
}

export const DEFAULT_ECHO_CATALOG: EchoExamCatalog[] = [
  { id: 'echo-abd', code: 'ECH001', name: 'Échographie abdominale', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-pel', code: 'ECH002', name: 'Échographie pelvienne', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-obs', code: 'ECH003', name: 'Échographie obstétricale', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-car', code: 'ECH004', name: 'Échographie cardiaque (ETT)', priceComptoir: 40000, priceSociete: 35000, priceExterne: 45000, urgentPrice: 50000 },
  { id: 'echo-ren', code: 'ECH005', name: 'Échographie rénale', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-thy', code: 'ECH006', name: 'Échographie thyroïdienne', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-mam', code: 'ECH007', name: 'Échographie mammaire', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-pmo', code: 'ECH008', name: 'Échographie des parties molles', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
  { id: 'echo-dop', code: 'ECH009', name: 'Échographie Doppler', priceComptoir: 35000, priceSociete: 30000, priceExterne: 40000, urgentPrice: 45000 },
  { id: 'echo-pro', code: 'ECH010', name: 'Échographie prostatique', priceComptoir: 25000, priceSociete: 22000, priceExterne: 30000, urgentPrice: 35000 },
];

/**
 * Extrait ou dérive le catalogue des échographies depuis la base unifiée des articles (famille ECHO).
 */
export function getEchoCatalog(articles: Article[] = []): EchoExamCatalog[] {
  const echoArts = articles.filter(a => isEchoFamily(a.family) && a.unit !== 'flacon' && a.unit !== 'boîte');
  if (echoArts.length === 0) return DEFAULT_ECHO_CATALOG;
  return echoArts.map((a, idx) => ({
    id: a.id,
    code: a.code || a.barcode || `ECH${String(idx + 1).padStart(3, '0')}`,
    name: a.name,
    priceComptoir: a.priceComptoir,
    priceSociete: a.priceSociete,
    priceExterne: a.priceExterne,
    urgentPrice: a.urgentPrice || (a.priceComptoir ? Math.round(a.priceComptoir * 1.4) : 35000),
  }));
}

/**
 * Extrait ou synchronise le catalogue du laboratoire depuis la base unifiée des articles (famille LABO).
 */
export function getLabCatalog(articles: Article[] = [], existingCatalog: LabExamCatalog[] = []): LabExamCatalog[] {
  const labArts = articles.filter(a => isLabFamily(a.family) && a.unit !== 'unité' && a.unit !== 'flacon' && a.unit !== 'boîte');
  if (labArts.length === 0) return existingCatalog.length > 0 ? existingCatalog : DEFAULT_LAB_CATALOG;
  const catalogMap = new Map<string, LabExamCatalog>();
  existingCatalog.forEach(e => {
    catalogMap.set(e.id, e);
    catalogMap.set(e.name.toLowerCase(), e);
  });
  DEFAULT_LAB_CATALOG.forEach(e => {
    if (!catalogMap.has(e.id)) catalogMap.set(e.id, e);
    if (!catalogMap.has(e.name.toLowerCase())) catalogMap.set(e.name.toLowerCase(), e);
  });
  return labArts.map((a, idx) => {
    const matched = catalogMap.get(a.id) || catalogMap.get(a.name.toLowerCase());
    return {
      id: a.id,
      code: a.code || a.barcode || matched?.code || `LAB${String(idx + 1).padStart(3, '0')}`,
      name: a.name,
      category: (a.category as LabCategory) || matched?.category || 'biochimie',
      parameters: a.parameters || matched?.parameters || [a.name],
      sampleType: a.sampleType || matched?.sampleType || 'Sang veineux',
      priceComptoir: a.priceComptoir,
      priceSociete: a.priceSociete,
      priceExterne: a.priceExterne,
      urgentPrice: a.urgentPrice || matched?.urgentPrice || (a.priceComptoir ? Math.round(a.priceComptoir * 1.5) : 25000),
      durationHours: a.durationHours || matched?.durationHours || 4,
      defaultUrgent: matched?.defaultUrgent || false,
    };
  });
}

/* ====== BASE UNIFIÉE DES ARTICLES (familles LABO + ECHO) ======
 * Tous les examens de laboratoire, les actes d'échographie et leurs
 * consommables (tubes, réactifs, lames, gel) vivent dans la table
 * `articles`. Les modules Magasinier, Laboratoire, Médecin, Caisse et
 * Facturation exploitent ce référentiel unique ; `labCatalog` n'est
 * conservé que comme miroir de compatibilité, synchronisé à chaque
 * démarrage. */

/** Consommables standards du laboratoire intégrés à la base unifiée des articles. */
export const DEFAULT_LAB_CONSUMABLE_ARTICLES: Article[] = [
  { id: 'art-006', name: 'Tube EDTA', family: 'LABO', unit: 'unité', barcode: '619100000006', priceComptoir: 300, priceSociete: 250, priceExterne: 400, purchasePrice: 100, stockCentral: 200, stockPharmacie: 50, minStockCentral: 30, minStockPharmacie: 20 },
  { id: 'art-007', name: 'Réactif Glycémie', family: 'LABO', unit: 'flacon', barcode: '619100000007', priceComptoir: 5000, priceSociete: 4500, priceExterne: 6000, purchasePrice: 2500, stockCentral: 30, stockPharmacie: 10, minStockCentral: 5, minStockPharmacie: 3, supplier: 'DISPHAR LABO', expiryDate: '2027-03-31' },
  { id: 'art-lab-015', name: 'Lames porte-objet', family: 'LABO', unit: 'boîte', barcode: '619100000015', priceComptoir: 8000, priceSociete: 7000, priceExterne: 10000, purchasePrice: 4000, stockCentral: 50, stockPharmacie: 15, minStockCentral: 10, minStockPharmacie: 5 },
];

/** Gel d'échographie intégré à la base unifiée des articles (famille ECHO). */
export const DEFAULT_ECHO_GEL_ARTICLE: Article = {
  id: 'art-008', name: 'Gel échographie', family: 'ECHO', unit: 'flacon', barcode: '619100000008',
  priceComptoir: 5000, priceSociete: 4000, priceExterne: 6000, purchasePrice: 2000,
  stockCentral: 0, stockPharmacie: 4, minStockCentral: 5, minStockPharmacie: 2,
};

/** Convertit un examen du catalogue laboratoire en article unifié (famille LABO). */
export function labExamToArticle(e: LabExamCatalog): Article {
  return {
    id: e.id, name: e.name, code: e.code, barcode: e.code, family: 'LABO', unit: 'analyse',
    priceComptoir: e.priceComptoir, priceSociete: e.priceSociete, priceExterne: e.priceExterne,
    urgentPrice: e.urgentPrice, purchasePrice: 0, stockCentral: 0, stockPharmacie: 0,
    minStockCentral: 0, minStockPharmacie: 0,
    alertDisabledCentral: true, alertDisabledPharmacie: true,
    category: e.category, parameters: e.parameters, sampleType: e.sampleType, durationHours: e.durationHours,
  };
}

/** Convertit un acte d'échographie en article unifié (famille ECHO). */
export function echoExamToArticle(e: EchoExamCatalog): Article {
  return {
    id: e.id, name: e.name, code: e.code, barcode: e.code, family: 'ECHO', unit: 'acte',
    priceComptoir: e.priceComptoir, priceSociete: e.priceSociete, priceExterne: e.priceExterne,
    urgentPrice: e.urgentPrice, purchasePrice: 0, stockCentral: 0, stockPharmacie: 0,
    minStockCentral: 0, minStockPharmacie: 0,
    alertDisabledCentral: true, alertDisabledPharmacie: true,
  };
}

/**
 * Garantit que la base locale suit la logique des articles unifiés :
 *  - si aucun examen LABO n'existe dans `articles`, les examens standards,
 *    les examens personnalisés de l'ancien `labCatalog` et les consommables
 *    y sont intégrés (migration idempotente des bases existantes) ;
 *  - si aucun acte ECHO n'existe dans `articles`, les actes standards et le
 *    gel d'échographie y sont intégrés ;
 *  - le miroir legacy `labCatalog` est synchronisé avec les articles
 *    (articles = source de vérité : ajouts et retraits répercutés).
 *
 * Aucun article existant n'est modifié ni écrasé.
 */
export function ensureUnifiedArticles(state: AppState): {
  state: AppState;
  changed: boolean;
  addedLab: number;
  addedEcho: number;
} {
  const articles: Article[] = state.articles || [];
  const byId = new Map<string, Article>(articles.map((a) => [a.id, a]));
  const nameSet = new Set<string>(articles.map((a) => (a.name || '').trim().toLowerCase()));
  const addedArticles: Article[] = [];

  const addIfMissing = (a: Article): boolean => {
    if (byId.has(a.id) || nameSet.has((a.name || '').trim().toLowerCase())) return false;
    byId.set(a.id, a);
    nameSet.add((a.name || '').trim().toLowerCase());
    addedArticles.push(a);
    return true;
  };

  const hasLabExams = articles.some((a) => isLabFamily(a.family) && a.unit === 'analyse');
  const hasEchoActs = articles.some((a) => isEchoFamily(a.family) && a.unit === 'acte');

  let addedLab = 0;
  let addedEcho = 0;

  if (!hasLabExams) {
    // 1. Examens standards + examens personnalisés de l'ancien catalogue (migration legacy)
    const legacyCatalog = state.labCatalog && state.labCatalog.length > 0 ? state.labCatalog : DEFAULT_LAB_CATALOG;
    for (const e of legacyCatalog) if (addIfMissing(labExamToArticle(e))) addedLab++;
    // 2. Consommables du laboratoire
    for (const a of DEFAULT_LAB_CONSUMABLE_ARTICLES) if (addIfMissing(a)) addedLab++;
  }

  if (!hasEchoActs) {
    for (const e of DEFAULT_ECHO_CATALOG) if (addIfMissing(echoExamToArticle(e))) addedEcho++;
    if (addIfMissing(DEFAULT_ECHO_GEL_ARTICLE)) addedEcho++;
  }

  const nextArticles = addedArticles.length > 0 ? [...articles, ...addedArticles] : articles;

  // Miroir legacy `labCatalog` : suit la base unifiée des articles.
  let labCatalog = state.labCatalog || [];
  let mirrorChanged = false;
  const labExamsNow = nextArticles.filter((a) => isLabFamily(a.family) && a.unit === 'analyse');
  if (labExamsNow.length > 0) {
    const kept = new Set<string>();
    const toAppend: LabExamCatalog[] = [];
    for (const a of labExamsNow) {
      const existing = labCatalog.find((e) => e.id === a.id)
        || labCatalog.find((e) => e.name.toLowerCase() === a.name.toLowerCase());
      if (existing) { kept.add(existing.id); continue; }
      const def = DEFAULT_LAB_CATALOG.find((d) => d.id === a.id || d.name.toLowerCase() === a.name.toLowerCase());
      toAppend.push({
        id: a.id,
        code: a.code || a.barcode || def?.code || '',
        name: a.name,
        category: (a.category as LabCategory) || def?.category || 'biochimie',
        parameters: a.parameters || def?.parameters || [a.name],
        sampleType: a.sampleType || def?.sampleType || 'Sang veineux',
        priceComptoir: a.priceComptoir,
        priceSociete: a.priceSociete,
        priceExterne: a.priceExterne,
        urgentPrice: a.urgentPrice || def?.urgentPrice || Math.round((a.priceComptoir || 0) * 1.5),
        durationHours: a.durationHours || def?.durationHours || 4,
        defaultUrgent: false,
      });
    }
    const filtered = labCatalog.filter((e) => kept.has(e.id));
    if (filtered.length !== labCatalog.length || toAppend.length > 0) {
      labCatalog = [...filtered, ...toAppend];
      mirrorChanged = true;
    }
  }

  const changed = addedLab + addedEcho > 0 || mirrorChanged;
  return changed
    ? { state: { ...state, articles: nextArticles, labCatalog }, changed: true, addedLab, addedEcho }
    : { state, changed: false, addedLab: 0, addedEcho: 0 };
}

/**
 * Prépare un état chargé depuis une base locale (IndexedDB ou MySQL) :
 * normalisation des familles, garantie de l'établissement principal et
 * synchronisation de la base unifiée des articles (LABO + ECHO).
 */
export function prepareLoadedState(state: AppState): AppState {
  const normalized = ensureEtablissements(normalizeFamilyBases(state));
  const { state: unified, changed, addedLab, addedEcho } = ensureUnifiedArticles(normalized);
  if (changed) {
    // eslint-disable-next-line no-console
    console.info(
      `[articles unifiés] base locale synchronisée : ${addedLab} article(s) LABO et ${addedEcho} article(s) ECHO intégrés à la table articles, catalogue legacy réaligné.`
    );
  }
  return unified;
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
