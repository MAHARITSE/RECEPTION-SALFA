import type { AppState } from '../../store';
import type { ClientType } from '../../types';
import { sharedTransactions } from './sharedData';
import { billingFamilyResolver } from './billingFamilies';

export interface BillingItem { description: string; actCode?: string; quantity?: number; unitPrice?: number; amount: number }
export interface BillingDocument {
  id: string; sourceId: string; category: ClientType; companyId?: string; companyName?: string;
  number: string; date: string; client: string; dossier?: string;
  matricule?: string; subCompany?: string; consultationDate?: string;
  /** Individual receipt values from the original piece, not insurer settlements. */
  individualGross?: number; individualNet?: number;
  total: number; copay: number; payable: number; paid: number; rejected: number;
  items: BillingItem[];
}
export interface MonthlyScope { month: string; category: ClientType; companyId?: string }
export interface MonthlyInvoice extends MonthlyScope {
  id: string; number: string; sequence: number; issuedAt: string; issuedBy: string; issuedByName: string;
  recipient: string; documents: BillingDocument[];
  total: number; copay: number; payable: number; paid: number; rejected: number; remaining: number;
  /** Trace of missing-family metadata repairs/migrations; original amounts stay frozen. */
  familyMetadataRepairs?: { date: string; userId: string; entries: { documentId: string; itemIndex: number; family: string }[] }[];
  facility: { name: string; address: string; phone: string; email: string; nif: string; currency: string };
}
export const categoryLabels: Record<ClientType, string> = { societe: 'Sociétés', comptoir: 'Comptoir', externe: 'Externes' };
export function localBillingDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function monthlyScopeId(scope: MonthlyScope): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(scope.month)) throw new Error('Mois de facturation invalide.');
  if (!['societe', 'comptoir', 'externe'].includes(scope.category)) throw new Error('Catégorie de facturation invalide.');
  if (scope.category === 'societe' && !scope.companyId) throw new Error('Sélectionnez une société pour cette facture mensuelle.');
  return `mensuelle:${scope.month}:${scope.category}${scope.category === 'societe' ? `:${scope.companyId}` : ''}`;
}

/** Same accounting sources, separate customer categories; no insurer entries
 * are fabricated for counter/external receipts. Mirrored legacy sales are skipped. */
export function collectBillingDocuments(state: AppState): BillingDocument[] {
  const transactions = sharedTransactions(state);
  const resolveFamily = billingFamilyResolver(state);
  const docs: BillingDocument[] = transactions.prestations.map(p => ({
    id: p.id, sourceId: p.sourceInvoiceId || p.id, category: 'societe', companyId: p.societeId,
    companyName: state.companies.find(c => c.id === p.societeId)?.name || p.societeNom || 'Société',
    number: p.numeroFacture, date: localBillingDate(state.invoices.find(i => i.id === p.sourceInvoiceId)?.createdAt || p.date), client: p.nomAgent || state.patients.filter(c => c.id === p.personneId).map(c => `${c.lastName} ${c.firstName}`.trim())[0] || 'Assuré',
    dossier: state.patients.find(c => c.id === p.personneId)?.dossier,
    matricule: p.matricule || state.patients.find(c => c.id === p.personneId)?.matricule,
    subCompany: p.sousSociete,
    consultationDate: localBillingDate(state.consultations.find(c => c.id === state.invoices.find(i => i.id === p.sourceInvoiceId)?.consultationId)?.date || p.date),
    individualGross: p.totalPrestation,
    individualNet: state.invoices.find(i => i.id === p.sourceInvoiceId)?.patientCharge ?? p.montantARembourser ?? p.totalPrestation - p.participation,
    total: p.totalPrestation, copay: p.participation, payable: p.montantARembourser ?? p.totalPrestation - p.participation,
    paid: p.totalPaye || 0, rejected: p.montantExclu || 0,
    items: p.lignes.map((l, index) => {
      const item = state.invoices.find(i => i.id === p.sourceInvoiceId)?.items[index];
      return { description: l.libelle || l.code, actCode: item ? resolveFamily({ articleCode: item.code, articleName: item.description, category: item.category }) : resolveFamily({ familyCode: l.code }),
        quantity: item?.quantity, unitPrice: item?.unitPrice, amount: l.totalPrestation };
    }),
  }));
  for (const invoice of state.invoices) {
    const category = invoice.isExternal || invoice.clientType === 'externe' ? 'externe' : invoice.clientType;
    if (category === 'societe') continue;
    const sale = state.ventes.find(v => v.legacyInvoiceId === invoice.id);
    if (sale?.status === 'annule') continue;
    const patient = state.patients.find(p => p.id === invoice.patientId);
    docs.push({ id: `caisse:${invoice.id}`, sourceId: invoice.id, category,
      number: sale?.numeroFacture || invoice.id, date: localBillingDate(invoice.createdAt),
      client: invoice.clientName || (patient ? `${patient.lastName} ${patient.firstName}`.trim() : categoryLabels[category]), dossier: patient?.dossier,
      matricule: patient?.matricule,
      consultationDate: localBillingDate(state.consultations.find(c => c.id === invoice.consultationId)?.date || invoice.createdAt),
      individualGross: invoice.totalAmount, individualNet: invoice.patientCharge,
      total: invoice.totalAmount, copay: 0, payable: invoice.totalAmount,
      paid: invoice.status === 'paid' && !invoice.creditSociete ? invoice.patientCharge : 0, rejected: 0,
      items: invoice.items.map(i => ({ description: i.description, actCode: resolveFamily({ articleCode: i.code, articleName: i.description, category: i.category }), quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount })),
    });
  }
  // Standalone native sales (including external sales), without counting a
  // migrated invoice a second time or resurrecting a deleted legacy invoice.
  for (const sale of state.ventes) {
    if (sale.legacyInvoiceId || state.invoices.some(i => i.id === sale.id) || sale.status === 'annule') continue;
    const category = sale.isExterne ? 'externe' : sale.clientType;
    const company = category === 'societe' ? state.companies.find(c => c.name.trim().toUpperCase() === (sale.company || '').trim().toUpperCase()) : undefined;
    if (category === 'societe' && !company) continue;
    const patient = state.patients.find(p => p.id === sale.patientId);
    docs.push({ id: `vente:${sale.id}`, sourceId: sale.id, category, companyId: company?.id, companyName: company?.name,
      number: sale.numeroFacture, date: localBillingDate(sale.dateVente),
      client: sale.clientName || (patient ? `${patient.lastName} ${patient.firstName}`.trim() : categoryLabels[category]), dossier: patient?.dossier,
      matricule: patient?.matricule, subCompany: sale.subCompany,
      consultationDate: localBillingDate(state.consultations.find(c => c.id === sale.consultationId)?.date || sale.dateVente),
      individualGross: sale.subtotal, individualNet: sale.montantFacture,
      total: sale.montantFacture, copay: 0, payable: sale.montantFacture, paid: sale.montantPaye, rejected: 0,
      items: state.venteLines.filter(l => l.venteId === sale.id).map(l => ({ description: l.articleName, actCode: resolveFamily({ articleId: l.articleId, articleName: l.articleName, category: l.category }), quantity: l.quantity, unitPrice: l.unitPrice, amount: Math.round(l.quantity * l.unitPrice * (1 - l.discount / 100) * 100) / 100 })),
    });
  }
  return docs.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function documentsForScope(documents: BillingDocument[], scope: MonthlyScope): BillingDocument[] {
  return documents.filter(d => d.category === scope.category && d.date.slice(0, 7) === scope.month && (scope.category !== 'societe' || d.companyId === scope.companyId));
}
export function monthlyGroups(documents: BillingDocument[]): MonthlyScope[] {
  const map = new Map<string, MonthlyScope>();
  for (const d of documents) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(d.date) || (d.category === 'societe' && !d.companyId)) continue;
    const scope = { category: d.category, month: d.date.slice(0, 7), companyId: d.companyId };
    map.set(monthlyScopeId(scope), scope);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month) || monthlyScopeId(a).localeCompare(monthlyScopeId(b)));
}
const rounded = (value: number) => Math.round(value * 100) / 100;
export function billingTotals(documents: BillingDocument[]) {
  const sum = (key: 'total' | 'copay' | 'payable' | 'paid' | 'rejected') => rounded(documents.reduce((s, d) => s + d[key], 0));
  const payable = sum('payable'), paid = sum('paid'), rejected = sum('rejected');
  return { total: sum('total'), copay: sum('copay'), payable, paid, rejected, remaining: rounded(Math.max(0, payable - paid - rejected)) };
}
/** Called inside the database transaction. Stable scope ID + saved sequence
 * prevent double-clicks, reprints and concurrent tabs from issuing duplicates. */
export function createMonthlyInvoice(state: AppState, scope: MonthlyScope, existing: MonthlyInvoice[], now = new Date().toISOString()): MonthlyInvoice {
  const id = monthlyScopeId(scope);
  const saved = existing.find(i => i.id === id);
  if (saved) return saved;
  if (!state.currentUser || !['admin', 'billing'].includes(state.currentUser.role)) throw new Error('Connexion facturation requise.');
  const documents = documentsForScope(collectBillingDocuments(state), scope);
  if (!documents.length) throw new Error('Aucune facture pour ce mois et cette catégorie.');
  if (documents.some(d => d.items.some(i => !i.actCode?.trim()))) throw new Error('Famille obligatoire manquante sur une ligne. Vérifiez les familles avant émission.');
  if (documents.some(d => [d.total, d.copay, d.payable, d.paid, d.rejected, ...d.items.map(i => i.amount)].some(n => !Number.isFinite(n) || n < 0))) throw new Error('Un montant est invalide. Corrigez la pièce d’origine avant émission.');
  const sequence = Math.max(0, ...existing.filter(i => i.month === scope.month).map(i => i.sequence)) + 1;
  const number = `FM-${scope.month}-${String(sequence).padStart(4, '0')}`;
  return structuredClone({ ...scope, id, sequence, number, documents, ...billingTotals(documents),
    issuedAt: now, issuedBy: state.currentUser.id, issuedByName: state.currentUser.name,
    recipient: scope.category === 'societe' ? documents[0].companyName || 'Société' : `Clients ${categoryLabels[scope.category]}`,
    facility: billingFacility(state),
  });
}

/** Accounting snapshots are immutable. Durable stored versions win over an
 * old tab's copy and are never removed by an ordinary application autosave. */
export function preserveMonthlyInvoices(stored: MonthlyInvoice[] = [], incoming: MonthlyInvoice[] = []): MonthlyInvoice[] {
  const map = new Map(incoming.map(i => [i.id, i]));
  stored.forEach(i => map.set(i.id, i));
  return [...map.values()];
}

export function billingFacility(state: AppState): MonthlyInvoice['facility'] {
  const ts = state.ticketSettings, header = ts.assuranceHeader;
  return { name: header?.etablissement ?? ts.facilityName, address: header?.adresse ?? ts.address,
    phone: header?.telephone ?? ts.phone, email: header?.email ?? ts.email ?? '',
    nif: header?.nifStat ?? ts.nif, currency: ts.currency };
}
