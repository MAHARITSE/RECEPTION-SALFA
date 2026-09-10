import type { AppState } from '../../store';
import type { Company, Patient, Invoice } from '../../types';
import type { Societe, Personne, Famille, Prestation, Paiement, LignePaiement } from './types';
import { societeDiminutive } from '../../utils/factureNumber';
import { reconcilePrestationsWithPaiements } from './utils/reconcile';

const key = (value?: string) => (value || '').trim().normalize('NFKC').toUpperCase();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const invoiceId = (id: string) => `caisse:${id}`;
const sourceId = (id: string) => id.startsWith('caisse:') ? id.slice(7) : undefined;
const categoryCode: Record<string, string> = { consultation: 'CONS', pharmacy: 'MEDIC', lab: 'LAB', echo: 'ECHO', surgery: 'HOSP', hospitalization: 'HOSP' };
export type SharedTable = 'assuranceSocietes' | 'assurancePersonnes' | 'assuranceFamilles' | 'assurancePrestations' | 'assurancePaiements';

/** Canonical identities always come from Reception. Insurance-only attributes
 * remain in the same AppState, keyed by the canonical entity ID. */
export function sharedSocietes(state: AppState): Societe[] {
  const rows = state.companies.map(company => {
    const extra = state.assuranceSocietes?.find(s => s.id === company.id || key(s.nom) === key(company.name));
    // Sans code enregistré, le diminutif est déduit du nom (ex: « Bureau des Services Administratifs » → BSA) ;
    // il sera enregistré dans la société dès la première facture émise à la caisse.
    return { ...extra, sharedCompany: true, id: company.id, nom: company.name, code: extra?.code || societeDiminutive(company.name),
      tauxCouvertureDefaut: company.tauxCouverture ?? extra?.tauxCouvertureDefaut ?? 100,
      // « Payeur global » (règlement en une fois) ou « Paiement partiel » (assurance, par assuré / par acte).
      modePaiement: extra?.modePaiement ?? (company.type === 'assurance' ? 'partiel' : 'global'),
      exclusions: extra?.exclusions };
  });
  // Old standalone entries remain visible until their first save/migration.
  return [...rows, ...(state.assuranceSocietes || []).filter(s => !s.sharedCompany && !rows.some(r => r.id === s.id || key(r.nom) === key(s.nom)))];
}

export function sharedPersonnes(state: AppState): Personne[] {
  const societes = sharedSocietes(state);
  const rows = state.patients.map(patient => {
    const societe = societes.find(s => key(s.nom) === key(patient.company));
    const extra = state.assurancePersonnes?.find(p => p.id === patient.id);
    return { ...extra, id: patient.id, nomPrenom: `${patient.lastName} ${patient.firstName}`.trim(),
      matricule: patient.matricule || '', societeId: societe?.id || '', sousSociete: patient.subCompany,
      qualite: patient.lienFamilial || extra?.qualite, dateNaissance: patient.dateOfBirth,
      telephone: patient.contact, dossier: patient.dossier, sharedPatient: true };
  });
  return [...rows, ...(state.assurancePersonnes || []).filter(p => !p.sharedPatient && !rows.some(r => r.id === p.id))];
}

export function sharedFamilles(state: AppState): Famille[] {
  const normalize = (code: string) => key(code) === 'LABO' ? 'LAB' : key(code);
  const rows = state.familles.map(f => {
    const extra = state.assuranceFamilles?.find(s => normalize(s.code) === normalize(f.code));
    return { ...extra, id: f.id, code: f.code, libelle: f.name, aliases: [...new Set([...(extra?.aliases || []), f.code])] };
  });
  return [...rows, ...(state.assuranceFamilles || []).filter(f => !rows.some(r => normalize(r.code) === normalize(f.code)))];
}

function companyForInvoice(state: AppState, invoice: Invoice): Societe | undefined {
  const vente = state.ventes.find(v => v.legacyInvoiceId === invoice.id);
  const patient = state.patients.find(p => p.id === invoice.patientId);
  // Prefer the sale's historical payer to a patient's current affiliation.
  const societies = sharedSocietes(state);
  if (vente?.company) return societies.find(s => key(s.nom) === key(vente.company));
  return societies.find(s => key(s.nom) === key(invoice.clientName)) || societies.find(s => key(s.nom) === key(patient?.company));
}

function caissePrestations(state: AppState): Prestation[] {
  return state.invoices.filter(i => i.clientType === 'societe' && !i.isExternal).flatMap(invoice => {
    const company = companyForInvoice(state, invoice);
    if (!company) return []; // Not silently attached to an arbitrary insurer.
    const patient = state.patients.find(p => p.id === invoice.patientId);
    const vente = state.ventes.find(v => v.legacyInvoiceId === invoice.id);
    if (vente?.status === 'annule') return [];
    const total = invoice.totalAmount;
    const net = Math.max(0, Math.min(total, invoice.assuranceSuivi?.montantARembourser ?? total));
    const mod = total - net;
    const id = invoiceId(invoice.id);
    // Allocate copay proportionally, keeping the exact invoice total on the last line.
    const items = invoice.items.length ? invoice.items : [{ description: 'Prestation Caisse', amount: total, category: 'consultation' as const }];
    let allocatedMod = 0;
    const lignes = items.map((item, index) => {
      const lineMod = index === items.length - 1 ? mod - allocatedMod : Math.round((total ? item.amount / total : 0) * mod * 100) / 100;
      allocatedMod += lineMod;
      return { id: `${id}:ligne:${index}`, prestationId: id, code: categoryCode[item.category] || item.code || 'CONS',
        libelle: item.description, totalPrestation: item.amount, ticketModerateur: lineMod,
        montantARembourser: Math.max(0, item.amount - lineMod), totalPaye: 0 };
    });
    return [{ id, sourceInvoiceId: invoice.id, numeroFacture: invoice.numeroFacture || vente?.numeroFacture || invoice.id,
      date: invoice.createdAt.slice(0, 10), dateCreation: invoice.createdAt,
      societeId: company.id, societeNom: company.nom, personneId: invoice.patientId || '',
      nomAgent: patient ? `${patient.lastName} ${patient.firstName}`.trim() : invoice.clientName,
      matricule: patient?.matricule, sousSociete: vente?.subCompany || patient?.subCompany || '',
      totalPrestation: total, montantTotal: total, participation: mod, ticketModerateur: mod,
      montantARembourser: net, statut: 'En attente' as const, lignes,
      commentaires: invoice.assuranceSuivi?.note }];
  });
}

/** Historical settlements are shown once. A payment covering several invoices
 * is kept unallocated: no invented per-invoice settlement or multiplication. */
function historicalPaiements(state: AppState, prestations: Prestation[]): Paiement[] {
  const out: Paiement[] = [];
  for (const account of state.companyBillingAccounts || []) {
    const company = sharedSocietes(state).find(s => key(s.nom) === key(account.company));
    if (!company) continue;
    for (const payment of account.payments || []) {
      const targets = (payment.invoiceIds?.length ? payment.invoiceIds : account.invoiceIds).map(id => prestations.find(p => p.sourceInvoiceId === id)).filter((p): p is Prestation => !!p);
      const targetIds = payment.invoiceIds?.length ? payment.invoiceIds : account.invoiceIds;
      const target = targetIds.length === 1 && targets.length === 1 ? targets[0] : undefined;
      const id = `historique:${account.id}:${payment.id}`;
      out.push({ id, sourceReadonly: true, numeroBordereau: payment.reference || id, datePaiement: payment.date,
        dateSaisie: payment.date, societeId: company.id, modePaiement: 'Autre', referencePaiement: payment.reference || '',
        totalReclame: payment.amount, totalPaye: payment.amount, totalModerateur: 0, totalExclu: 0, remise: 0, statut: 'Validé',
        notes: target ? 'Règlement historique de la base Réception.' : 'Règlement historique global conservé sans ventilation par facture.',
        lignes: [paymentLine(id, target, payment.amount, 0)] });
    }
  }
  for (const p of prestations) {
    const invoice = state.invoices.find(i => i.id === p.sourceInvoiceId)!;
    const allocated = out.flatMap(pm => pm.lignes).filter(l => l.prestationId === p.id).reduce((sum, l) => sum + l.totalPaye, 0);
    // creditSociete means validated by Caisse, NOT cash received from the insurer.
    const inGlobalAccount = state.companyBillingAccounts.some(a => a.payments.some(pm => { const ids = pm.invoiceIds?.length ? pm.invoiceIds : a.invoiceIds; return ids.length > 1 && ids.includes(invoice.id); }));
    const cashPaid = invoice.status === 'paid' && !invoice.creditSociete && !inGlobalAccount ? Math.max(0, (p.montantARembourser || 0) - allocated) : 0;
    const rejected = invoice.assuranceSuivi?.legacyMontantRejete ?? invoice.assuranceSuivi?.montantRejete ?? 0;
    if (!(cashPaid > 0 || rejected > 0)) continue;
    const id = `historique:facture:${invoice.id}`;
    out.push({ id, sourceReadonly: true, numeroBordereau: invoice.assuranceSuivi?.numeroBordereau || id,
      datePaiement: invoice.paidAt || invoice.createdAt, dateSaisie: invoice.createdAt,
      societeId: p.societeId, modePaiement: 'Autre', referencePaiement: '', totalReclame: p.totalPrestation,
      totalPaye: cashPaid, totalModerateur: 0, totalExclu: rejected, remise: 0, statut: 'Validé',
      notes: 'Situation historique de la facture Réception (lecture seule).', lignes: [paymentLine(id, p, cashPaid, rejected)] });
  }
  return out;
}

function paymentLine(id: string, p: Prestation | undefined, paid: number, rejected: number): LignePaiement {
  return { id: `${id}:ligne`, paiementId: id, prestationId: p?.id || '', lignePrestationId: '',
    prestationNumero: p?.numeroFacture, immatriculation: p?.matricule || '', nomBaseAssurance: p?.nomAgent || '',
    totalPaye: paid, ticketModerateur: 0, montantExclu: rejected };
}

export function sharedTransactions(state: AppState) {
  const sources = caissePrestations(state);
  // A source invoice is never copied into the assurance table.
  const manual = (state.assurancePrestations || []).filter(p => !p.sourceInvoiceId && !sourceId(p.id));
  const paiements = [...historicalPaiements(state, sources), ...(state.assurancePaiements || []).filter(p => !p.sourceReadonly)];
  const prestations = reconcilePrestationsWithPaiements([...sources, ...manual], paiements);
  return { prestations, paiements };
}

export function readSharedTable(state: AppState, table: SharedTable): NonNullable<AppState[SharedTable]> {
  if (table === 'assuranceSocietes') return sharedSocietes(state);
  if (table === 'assurancePersonnes') return sharedPersonnes(state);
  if (table === 'assuranceFamilles') return sharedFamilles(state);
  const transactions = sharedTransactions(state);
  return table === 'assurancePrestations' ? transactions.prestations : transactions.paiements;
}

function saveSocietes(state: AppState, rows: Societe[]): AppState {
  const current = sharedSocietes(state);
  const removed = current.filter(s => !rows.some(r => r.id === s.id));
  for (const s of removed) {
    if (state.patients.some(p => key(p.company) === key(s.nom)) || sharedTransactions(state).prestations.some(p => p.societeId === s.id) || state.companyBillingAccounts.some(a => key(a.company) === key(s.nom))) {
      throw new Error('Cette société est utilisée par la base commune. Elle ne peut pas être supprimée.');
    }
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (!key(row.nom) || seen.has(key(row.nom))) throw new Error('Nom de société vide ou déjà utilisé dans Réception.');
    if (!Number.isFinite(row.tauxCouvertureDefaut) || row.tauxCouvertureDefaut < 0 || row.tauxCouvertureDefaut > 100) throw new Error('Le taux de couverture doit être compris entre 0 et 100 %.');
    seen.add(key(row.nom));
  }
  const renames = new Map<string, string>();
  const companies: Company[] = rows.map(s => {
    const existing = state.companies.find(c => c.id === s.id);
    if (existing && existing.name !== s.nom) renames.set(key(existing.name), s.nom);
    return { ...existing, id: s.id, name: s.nom.trim(), paymentMode: 'Crédit',
      settlementMode: existing?.settlementMode || 'per_invoice',
      // Rattachement au type commun : 'payeur' = payeur global, 'assurance' = paiement partiel.
      type: s.modePaiement ? (s.modePaiement === 'global' ? 'payeur' : 'assurance') : (existing?.type || 'assurance'),
      tauxCouverture: s.tauxCouvertureDefaut, createdAt: existing?.createdAt || new Date().toISOString() };
  });
  return { ...state, companies, assuranceSocietes: rows.map(s => ({ ...s, sharedCompany: true })),
    patients: state.patients.map(p => renames.has(key(p.company)) ? { ...p, company: renames.get(key(p.company)) } : p),
    ventes: state.ventes.map(v => renames.has(key(v.company)) ? { ...v, company: renames.get(key(v.company)) } : v),
    companyBillingAccounts: state.companyBillingAccounts.map(a => renames.has(key(a.company)) ? { ...a, company: renames.get(key(a.company))! } : a) };
}

function savePersonnes(state: AppState, rows: Personne[]): AppState {
  const current = sharedPersonnes(state);
  if (state.patients.some(p => !rows.some(r => r.id === p.id))) throw new Error('Un dossier patient partagé ne se supprime pas depuis le suivi assurance. Utilisez la Réception.');
  const patients: Patient[] = state.patients.map(patient => {
    const row = rows.find(p => p.id === patient.id)!;
    const original = current.find(p => p.id === patient.id);
    if (same(row, original)) return patient;
    const company = sharedSocietes(state).find(s => s.id === row.societeId);
    if (!company) throw new Error('Choisissez une société de la base commune pour cet assuré.');
    // Identity and clinical fields are edited in Reception, not inferred from a full name.
    if (row.nomPrenom !== original?.nomPrenom || row.dateNaissance !== original?.dateNaissance) throw new Error('Modifiez le nom et la naissance du patient dans Réception.');
    return { ...patient, company: company.nom, clientType: 'societe', subCompany: row.sousSociete,
      matricule: row.matricule, contact: row.telephone || '', lienFamilial: row.qualite };
  });
  for (const row of rows) {
    if (!state.patients.some(p => p.id === row.id) && !state.assurancePersonnes?.some(p => p.id === row.id)) {
      throw new Error(`Patient « ${row.nomPrenom} » absent de Réception. Créez son dossier dans Réception avant de l'affilier ou d'importer sa prestation.`);
    }
  }
  return { ...state, patients, assurancePersonnes: rows.filter(r => !r.sharedPatient || r.email || r.familleCode || r.tauxCouverture !== undefined || r.statut).map(({ dossier: _, ...r }) => r) };
}

function saveFamilles(state: AppState, rows: Famille[]): AppState {
  if (state.familles.some(f => !rows.some(r => r.id === f.id))) throw new Error('Une famille commune doit être gérée dans le catalogue de Réception.');
  return { ...state, assuranceFamilles: rows,
    familles: rows.map(f => {
      const existing = state.familles.find(r => r.id === f.id);
      if (existing && existing.code !== f.code && state.articles.some(a => a.family === existing.code)) throw new Error('Ce code de famille est utilisé par des articles.');
      return { ...existing, id: f.id, code: f.code, name: f.libelle, color: existing?.color || '#64748b', manageStock: existing?.manageStock ?? false };
    }) };
}

export function writeSharedTable(state: AppState, table: SharedTable, value: NonNullable<AppState[SharedTable]>): AppState {
  if (table === 'assuranceSocietes') return saveSocietes(state, value as Societe[]);
  if (table === 'assurancePersonnes') return savePersonnes(state, value as Personne[]);
  if (table === 'assuranceFamilles') return saveFamilles(state, value as Famille[]);
  const current = sharedTransactions(state);
  let next = state;
  if (table === 'assurancePrestations') {
    const rows = value as Prestation[];
    for (const source of current.prestations.filter(p => p.sourceInvoiceId)) {
      const changed = rows.find(r => r.id === source.id);
      if (!changed) throw new Error('Une facture de Caisse ne peut pas être supprimée depuis le suivi assurance.');
      const core = (p: Prestation) => [p.numeroFacture, p.date, p.societeId, p.personneId, p.totalPrestation, p.participation,
        p.lignes.map(l => [l.id, l.code, l.libelle, l.totalPrestation, l.ticketModerateur])];
      if (!same(core(source), core(changed))) throw new Error('Les montants, actes et bénéficiaires des factures Caisse sont en lecture seule. Corrigez la facture dans son module d’origine.');
    }
    const manual = rows.filter(p => !p.sourceInvoiceId && !sourceId(p.id));
    for (const p of manual) {
      if (!sharedSocietes(state).some(s => s.id === p.societeId) || !sharedPersonnes(state).some(s => s.id === p.personneId)) throw new Error('La prestation doit référencer une société et un assuré de la base commune.');
      if (current.prestations.some(s => s.sourceInvoiceId && s.societeId === p.societeId && key(s.numeroFacture) === key(p.numeroFacture))) throw new Error('Cette facture existe déjà dans la Caisse : utilisez la prestation liée, sans la réimporter.');
    }
    next = { ...state, assurancePrestations: manual, invoices: state.invoices.map(invoice => {
      const row = rows.find(p => p.sourceInvoiceId === invoice.id || sourceId(p.id) === invoice.id);
      if (!row || (row.commentaires || '') === (invoice.assuranceSuivi?.note || '')) return invoice;
      return { ...invoice, assuranceSuivi: { ...invoice.assuranceSuivi, note: row.commentaires || '' } };
    }) };
  } else {
    const rows = value as Paiement[];
    for (const original of current.paiements.filter(p => p.sourceReadonly)) {
      if (!same(original, rows.find(r => r.id === original.id))) throw new Error('Les règlements historiques de Réception sont conservés en lecture seule.');
    }
    next = { ...state, assurancePaiements: rows.filter(p => !p.sourceReadonly) };
  }
  return syncSharedInvoiceBalances(next);
}

/** Insurance collections supplement the same invoice, never the cash receipt:
 * insurer payments must not alter creditSociete, stock, paidAt or a cash closing. */
export function syncSharedInvoiceBalances(state: AppState): AppState {
  if (state.assuranceStorageSupported === false) return state;
  const transactions = sharedTransactions(state);
  const newSourceIds = new Set((state.assurancePaiements || []).flatMap(p => p.lignes.map(l => sourceId(l.prestationId))).filter(Boolean));
  return { ...state, invoices: state.invoices.map(invoice => {
    if (!newSourceIds.has(invoice.id) && invoice.assuranceSuivi?.montantRegle === undefined) return invoice;
    const row = transactions.prestations.find(p => p.sourceInvoiceId === invoice.id);
    if (!row) return invoice;
    return { ...invoice, assuranceSuivi: { ...invoice.assuranceSuivi,
      legacyMontantRejete: invoice.assuranceSuivi?.legacyMontantRejete ?? invoice.assuranceSuivi?.montantRejete ?? 0,
      montantRegle: row.totalPaye || 0, montantRejete: row.montantExclu || 0, dateDernierReglement: row.datePaiement } };
  }) };
}
