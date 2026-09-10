import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import type { Paiement } from '../src/modules/assurance/types';
import { sharedSocietes, sharedPersonnes, sharedFamilles, sharedTransactions, writeSharedTable } from '../src/modules/assurance/sharedData';
import { linkSharedReferences } from '../src/modules/assurance/linkReferences';

function base(): AppState {
  const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  return { ...seed, companies: [{ id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance', tauxCouverture: 80 }],
    patients: [{ ...seed.patients[0], id: 'patient-1', lastName: 'RAKOTO', firstName: 'TEST', company: 'ASSURANCE COMMUNE', clientType: 'societe', matricule: 'MAT-COMMUN' }],
    invoices: [{ id: 'invoice-1', patientId: 'patient-1', clientType: 'societe', isExternal: false, status: 'paid', creditSociete: true, totalAmount: 10000, patientCharge: 10000, createdAt: '2026-09-10T08:00:00Z', paidAt: '2026-09-10T09:00:00Z', items: [{ description: 'Consultation', category: 'consultation', amount: 10000 }] }],
    ventes: [], ventePayments: [], companyBillingAccounts: [], assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [] };
}
function payment(state: AppState, amount = 3000, rejected = 0): Paiement {
  const p = sharedTransactions(state).prestations[0];
  return { id: 'payment-1', societeId: p.societeId, numeroBordereau: 'BORD-1', referencePaiement: 'VIR-1', datePaiement: '2026-09-10', dateSaisie: '2026-09-10', modePaiement: 'Virement bancaire', totalPaye: amount, totalReclame: 10000, totalModerateur: 0, totalExclu: rejected, remise: 0, statut: 'Validé',
    lignes: [{ id: 'payment-line-1', paiementId: 'payment-1', prestationId: p.id, prestationNumero: p.numeroFacture, lignePrestationId: p.lignes[0].id, immatriculation: 'MAT-COMMUN', nomBaseAssurance: 'RAKOTO TEST', totalPaye: amount, ticketModerateur: 0, montantExclu: rejected }] };
}

test('les référentiels et factures de Caisse sont lus directement, sans copie', () => {
  const state = base();
  expect(sharedSocietes(state)[0].id).toBe(state.companies[0].id);
  expect(sharedPersonnes(state)[0].id).toBe(state.patients[0].id);
  expect(sharedFamilles(state)[0].id).toBe(state.familles[0].id);
  const tx = sharedTransactions(state);
  expect(tx.prestations).toHaveLength(1);
  expect(tx.prestations[0]).toMatchObject({ sourceInvoiceId: 'invoice-1', totalPaye: 0, resteAPayer: 10000 });
  expect(state.assurancePrestations).toEqual([]);
  const updated = { ...state, invoices: [{ ...state.invoices[0], totalAmount: 12000, items: [{ ...state.invoices[0].items[0], amount: 12000 }] }] };
  expect(sharedTransactions(updated).prestations[0].totalPrestation).toBe(12000);
});

test('modification société et couverture patient écrivent dans les tables communes', () => {
  const state = base();
  const changed = writeSharedTable(state, 'assuranceSocietes', sharedSocietes(state).map(s => ({ ...s, nom: 'ASSURANCE RENOMMEE', tauxCouvertureDefaut: 90 })));
  expect(changed.companies[0]).toMatchObject({ name: 'ASSURANCE RENOMMEE', tauxCouverture: 90 });
  expect(changed.patients[0].company).toBe('ASSURANCE RENOMMEE');
  expect(sharedTransactions(changed).prestations).toHaveLength(1);
  const insured = writeSharedTable(changed, 'assurancePersonnes', sharedPersonnes(changed).map(p => ({ ...p, matricule: 'NOUVEAU', sousSociete: 'SERVICE A' })));
  expect(insured.patients[0]).toMatchObject({ matricule: 'NOUVEAU', subCompany: 'SERVICE A' });
  expect(insured.patients[0].antecedents).toEqual(state.patients[0].antecedents);
  expect(insured.patients).toHaveLength(1);
});

test('un règlement assurance met à jour la même facture, sans encaissement Caisse supplémentaire', () => {
  const state = base();
  const changed = writeSharedTable(state, 'assurancePaiements', [payment(state)]);
  expect(changed.invoices[0].assuranceSuivi?.montantRegle).toBe(3000);
  expect(sharedTransactions(changed).prestations[0]).toMatchObject({ totalPaye: 3000, resteAPayer: 7000 });
  expect(changed.invoices[0]).toMatchObject({ status: 'paid', creditSociete: true, paidAt: state.invoices[0].paidAt, totalAmount: 10000 });
  expect(changed.cashClosings).toEqual(state.cashClosings);
  expect(changed.ventePayments).toEqual(state.ventePayments);
  expect(changed.articles).toEqual(state.articles);
  expect(changed.assurancePrestations).toEqual([]);
  const deleted = writeSharedTable(changed, 'assurancePaiements', []);
  expect(deleted.invoices[0].assuranceSuivi?.montantRegle).toBe(0);
  expect(sharedTransactions(deleted).prestations[0].resteAPayer).toBe(10000);
});

test('rejets liés ne sont pas doublés lors de la relecture ou de la suppression du règlement', () => {
  const state = base();
  const changed = writeSharedTable(state, 'assurancePaiements', [payment(state, 0, 2500)]);
  expect(changed.invoices[0].assuranceSuivi?.montantRejete).toBe(2500);
  expect(sharedTransactions(changed).prestations[0].montantExclu).toBe(2500);
  expect(sharedTransactions(structuredClone(changed)).prestations[0].montantExclu).toBe(2500);
  expect(writeSharedTable(changed, 'assurancePaiements', []).invoices[0].assuranceSuivi?.montantRejete).toBe(0);
});

test('factures et dossiers partagés sont protégés contre suppression et doublons', () => {
  const state = base();
  expect(() => writeSharedTable(state, 'assurancePrestations', [])).toThrow(/Caisse/);
  expect(() => writeSharedTable(state, 'assurancePersonnes', [])).toThrow(/dossier patient/);
  const p = sharedTransactions(state).prestations[0];
  expect(() => writeSharedTable(state, 'assurancePrestations', [{ ...p, totalPrestation: 1 }])).toThrow(/lecture seule/);
  expect(() => writeSharedTable(state, 'assurancePrestations', [p, { ...p, id: 'import-duplicate', sourceInvoiceId: undefined }])).toThrow(/déjà dans la Caisse/);
});

test('règlement historique global compté une fois, jamais attribué intégralement à chaque facture', () => {
  const state = base();
  state.invoices.push({ ...state.invoices[0], id: 'invoice-2' });
  state.companyBillingAccounts = [{ id: 'account-1', company: 'ASSURANCE COMMUNE', month: '2026-09', invoiceIds: ['invoice-1', 'invoice-2'], totalAmount: 20000, paidAmount: 8000, status: 'partial', createdAt: '2026-09-10', payments: [{ id: 'old-payment', amount: 8000, date: '2026-09-10', invoiceIds: ['invoice-1', 'invoice-2'] }] }];
  const tx = sharedTransactions(state);
  expect(tx.paiements).toHaveLength(1);
  expect(tx.paiements[0].totalPaye).toBe(8000);
  expect(tx.paiements[0].lignes[0].prestationId).toBe('');
  expect(tx.prestations.every(p => p.totalPaye === 0)).toBe(true);
  expect(() => writeSharedTable(state, 'assurancePaiements', [])).toThrow(/historiques/);
});

test('raccordement idempotent de l’ancien suivi par nom société et matricule unique, sans effacement', () => {
  const state = base();
  state.assuranceSocietes = [{ id: 'old-soc', nom: 'assurance commune', code: 'AC', tauxCouvertureDefaut: 80 }];
  state.assurancePersonnes = [{ id: 'old-person', nomPrenom: 'Ancien libellé', matricule: 'MAT-COMMUN', societeId: 'old-soc' }];
  const linked = linkSharedReferences(state);
  expect(linked.assuranceSocietes?.[0].id).toBe('soc-1');
  expect(linked.assurancePersonnes?.[0].id).toBe('patient-1');
  expect(linked.patients).toEqual(state.patients);
  expect(linked.invoices).toEqual(state.invoices);
  expect(linkSharedReferences(linked)).toBe(linked);
});

test('deux règlements de postes différents recalculent le solde de la facture commune après fusion', async () => {
  const { mergeStates } = await import('../src/syncMerge');
  const state = base();
  const local = writeSharedTable(state, 'assurancePaiements', [payment(state, 3000)]);
  const second = payment(state, 4000);
  second.id = 'payment-2';
  second.lignes = second.lignes.map(l => ({ ...l, id: 'payment-line-2', paiementId: 'payment-2' }));
  const remote = writeSharedTable(state, 'assurancePaiements', [second]);
  const merged = mergeStates(state, local, remote);
  expect(merged.assurancePaiements).toHaveLength(2);
  expect(merged.invoices[0].assuranceSuivi?.montantRegle).toBe(7000);
  expect(sharedTransactions(merged).prestations[0].resteAPayer).toBe(3000);
});
