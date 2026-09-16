import { expect, test } from '@playwright/test';
import type { AppState } from '../src/store';
import type { Invoice } from '../src/types';
import { collectBillingDocuments } from '../src/modules/assurance/monthlyBilling';
import { sharedTransactions, typeClientEffectif } from '../src/modules/assurance/sharedData';
import { copayMetadata, repartirLotCaisse } from '../src/utils/copayCaisse';

/**
 * ENCAISSEMENT DU TICKET MODÉRATEUR — ÉCRITURES DE CAISSE ET FACTURATION
 * Ce que la caisse produit pour un client société dont la réduction est un
 * TICKET MODÉRATEUR :
 *  1. chaque facture créditée à la société porte le NET (part prise en charge)
 *     et son suivi assurance → la facturation société ne réclame que ce net ;
 *  2. une facture d'ESPÈCES distincte porte la quote-part encaissée : elle seule
 *     entre dans les encaissements et la clôture Z du caissier ;
 *  3. cette facture d'espèces n'est JAMAIS réclamée à la société (ni comme
 *     prestation assurance, ni comme pièce à facturer au comptoir).
 */

const AUJOURDHUI = new Date().toISOString();
const societe = { id: 'soc-1', nom: 'CNAPS', code: 'CNP', tauxCouvertureDefaut: 80 };
const personne = { id: 'pat-1', nomPrenom: 'RAKOTO Jean', matricule: 'M-1', societeId: 'soc-1' };

/** Lot de caisse : une facture d'analyse + une facture de médicaments. */
const lot = repartirLotCaisse({
  societe, personne,
  factures: [
    { id: 'inv-labo', items: [{ description: 'NFS', amount: 30_000, quantity: 1, unitPrice: 30_000, category: 'lab' as const }] },
    { id: 'inv-meds', items: [{ description: 'PARACETAMOL', amount: 50_000, quantity: 1, unitPrice: 50_000, category: 'pharmacy' as const }] },
  ],
});
const [repLabo, repMeds] = lot.parFacture;
const repTotal = lot.total;

/** Écritures produites par la caisse (mêmes champs que `handlePayment`). */
const factureSociete = (id: string, brut: number, net: number, rep: typeof repLabo, category: 'lab' | 'pharmacy'): Invoice => ({
  id, patientId: 'pat-1', clientType: 'societe', clientName: 'RAKOTO Jean',
  items: [{ description: category === 'lab' ? 'NFS' : 'PARACETAMOL', amount: brut, quantity: 1, unitPrice: brut, category }],
  totalAmount: brut, patientCharge: net, numeroFacture: `FA-09/CNP/26-00${id.slice(-1)}`,
  status: 'paid', paidAt: AUJOURDHUI, paidBy: 'CAIS1', createdAt: AUJOURDHUI, isExternal: false, creditSociete: true,
  assuranceSuivi: { montantARembourser: net },
  copayTicketModerateur: copayMetadata(rep, { numeroFactureSociete: `FA-09/CNP/26-00${id.slice(-1)}` }),
});

const invLabo = factureSociete('inv-labo', 30_000, repLabo.partSociete, repLabo, 'lab');
const invMeds = factureSociete('inv-meds', 50_000, repMeds.partSociete, repMeds, 'pharmacy');
const invEspeces: Invoice = {
  id: 'inv-copay', patientId: 'pat-1', clientType: 'comptoir', clientName: 'RAKOTO Jean',
  items: [{ description: 'Ticket modérateur — quote-part de l’assuré (CNAPS)', amount: repTotal.ticketModerateur, quantity: 1, unitPrice: repTotal.ticketModerateur, category: 'consultation' }],
  totalAmount: repTotal.ticketModerateur, patientCharge: repTotal.ticketModerateur, numeroFacture: '26FA0916101',
  status: 'paid', paidAt: AUJOURDHUI, paidBy: 'CAIS1', createdAt: AUJOURDHUI, isExternal: false, creditSociete: false,
  copayTicketModerateur: copayMetadata(repTotal, { sourceInvoiceIds: ['inv-labo', 'inv-meds'], numeroFactureSociete: invMeds.numeroFacture }),
};

const state = {
  companies: [{ id: 'soc-1', name: 'CNAPS', tauxCouverture: 80, type: 'assurance' }],
  patients: [{ id: 'pat-1', lastName: 'RAKOTO', firstName: 'Jean', dossier: 'D-1', matricule: 'M-1', clientType: 'societe', company: 'CNAPS' }],
  invoices: [invLabo, invMeds, invEspeces],
  consultations: [], ventes: [], venteLines: [], familles: [], articles: [],
  assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [],
  assurancePrestations: [], assurancePaiements: [], companyBillingAccounts: [],
} as unknown as AppState;

test('répartition du lot : net société et quote-part à encaisser', () => {
  expect(repTotal.brut).toBe(80_000);
  expect(repTotal.partSociete).toBe(64_000);
  expect(repTotal.ticketModerateur).toBe(16_000);
  expect(repTotal.aEncaisser).toBe(true);
});

test('encaissements de la caisse : seules les espèces du ticket modérateur comptent', () => {
  // Filtre de la clôture Z : les factures de crédit société ne sont pas des espèces.
  const especes = state.invoices.filter(i => i.status === 'paid' && !i.creditSociete);
  expect(especes.map(i => i.id)).toEqual(['inv-copay']);
  expect(especes.reduce((s, i) => s + i.patientCharge, 0)).toBe(16_000);
  // Le brut du dossier reste visible, mais porté au compte de la société.
  expect(state.invoices.filter(i => i.creditSociete).reduce((s, i) => s + i.patientCharge, 0)).toBe(64_000);
});

test('facturation société : le net crédité et la quote-part de l’assuré', () => {
  const prestations = sharedTransactions(state).prestations;
  // La facture d'espèces n'est jamais réclamée à la société.
  expect(prestations.map(p => p.sourceInvoiceId).sort()).toEqual(['inv-labo', 'inv-meds']);
  expect(typeClientEffectif(state, invEspeces)).toBe('comptoir');
  expect(typeClientEffectif(state, invLabo)).toBe('societe');

  const labo = prestations.find(p => p.sourceInvoiceId === 'inv-labo')!;
  expect(labo.totalPrestation).toBe(30_000);
  expect(labo.montantARembourser).toBe(24_000);
  expect(labo.ticketModerateur).toBe(6_000);
  expect(labo.societeNom).toBe('CNAPS');

  const meds = prestations.find(p => p.sourceInvoiceId === 'inv-meds')!;
  expect(meds.montantARembourser).toBe(40_000);
  expect(meds.ticketModerateur).toBe(10_000);
});

test('pièces à facturer : la quote-part n’apparaît pas en double au comptoir', () => {
  const documents = collectBillingDocuments(state);
  // Aucune pièce comptoir pour l'encaissement du ticket modérateur : la quote-part
  // figure déjà comme participation sur les prestations société.
  expect(documents.some(d => d.sourceId === 'inv-copay')).toBe(false);
  const societeDocs = documents.filter(d => d.category === 'societe');
  expect(societeDocs).toHaveLength(2);
  // Net individuel = part créditée à la société (patientCharge), quote-part à part.
  expect(societeDocs.map(d => d.individualNet).sort((a, b) => a - b)).toEqual([24_000, 40_000]);
  expect(societeDocs.map(d => d.copay).sort((a, b) => a - b)).toEqual([6_000, 10_000]);
  expect(societeDocs.every(d => d.natureRemise === 'ticket_moderateur')).toBe(true);
});

test('remise : crédit société intégral, aucune facture d’espèces', () => {
  const remise = repartirLotCaisse({
    societe: { ...societe, natureRemise: 'remise' }, personne,
    factures: [{ id: 'inv-labo', items: invLabo.items }],
  });
  expect(remise.total.aEncaisser).toBe(false);
  expect(remise.total.ticketModerateur).toBe(0);
  expect(remise.total.partSociete).toBe(remise.total.brut);
  // La caisse n'émet alors aucune facture d'espèces : le crédit reste intégral.
  expect(remise.total.partSociete).toBe(30_000);
});
