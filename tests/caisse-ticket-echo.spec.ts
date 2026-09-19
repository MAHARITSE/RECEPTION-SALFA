import { expect, test } from '@playwright/test';
import type { Invoice, InvoiceItem } from '../src/types';
import type { Societe } from '../src/modules/assurance/types';
import { brutLigneDepuisItem, estPieceTicketModerateur, repartirItemsCaisse, repartirLotCaisse } from '../src/utils/copayCaisse';
import { paymentTicketHtml } from '../src/utils/printTicket';
import type { TicketSettings } from '../src/types';

/** Réglages de ticket minimaux + montant au format des tickets (80 mm). */
const settings = (): TicketSettings => ({
  facilityName: 'CENTRE SALFA', address: '', phone: '', nif: '', paperWidth: 80,
  showLogo: false, logoUrl: '', receiptTitle: 'REÇU DE PAIEMENT', footerMessage: 'Merci',
  currency: 'Ar', copies: 1, autoPrint: false,
} as TicketSettings);
const money = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ar`;

/**
 * PRIX DE L'ÉCHOGRAPHIE À LA CAISSE — CAS SIGNALÉ PAR LE CLIENT (société JIRAMA) :
 *
 *   Paracétamol 500 mg ×10, rem 30 %, P.U. 450,00   → montant 3 150,00
 *   Échographie abdominale ×1, rem 20 %, P.U. 22 000,00 → montant 17 600,00
 *   TOTAL prestations 22 100,00 (22 000 + … ) ; ticket 4 870,00 ; crédit 17 230,00
 *
 * L'échographie est facturée 17 600,00 : c'est le prix « AVEC TICKET » (tarif
 * société 22 000,00 − 20 % de ticket modérateur). La caisse ne doit donc pas
 * déduire ce ticket une seconde fois : le brut réparti reste 22 000,00, la
 * société est créditée de 17 600,00 et l'assuré doit 4 400,00 — UNE seule fois.
 */

const societe = (over: Partial<Societe> = {}): Societe => ({
  id: 'cmp-jirama', nom: 'JIRAMA', code: 'JIR', tauxCouvertureDefaut: 80, ...over,
});

/** Ligne d'échographie telle que la crée le médecin : montant = net de la remise. */
const echoItem = (over: Partial<InvoiceItem> = {}): InvoiceItem => ({
  code: 'ECHO', description: 'Échographie abdominale', quantity: 1,
  unitPrice: 22_000, amount: 17_600, discount: 20, category: 'echo', ...over,
});

/** Ligne pharmacie telle que la caisse la construit : montant = brut (remise à part). */
const medsItem = (over: Partial<InvoiceItem> = {}): InvoiceItem => ({
  code: 'MEDIC', description: 'Paracétamol 500mg', quantity: 10,
  unitPrice: 450, amount: 4_500, discount: 30, category: 'pharmacy', ...over,
});

test('échographie « prix avec ticket » : le ticket n’est déduit qu’une seule fois', () => {
  // Le brut de la ligne est le tarif société AVANT la remise (22 000), jamais le
  // montant déjà remisé (17 600).
  expect(brutLigneDepuisItem(echoItem())).toBe(22_000);
  // Ancienne forme enregistrée : prix unitaire déjà remisé → on restitue le brut.
  expect(brutLigneDepuisItem(echoItem({ unitPrice: 17_600 }))).toBe(22_000);
  // Ligne pharmacie : le montant EST le brut, la remise est appliquée à part.
  expect(brutLigneDepuisItem(medsItem())).toBe(4_500);
  // Une vraie remise de 100 % ne double rien : le brut reste le montant facturé.
  expect(brutLigneDepuisItem(echoItem({ unitPrice: 0, amount: 0 }))).toBe(0);
});

test('caisse société JIRAMA : échographie 22 000 → 17 600 société / 4 400 patient', () => {
  const rep = repartirItemsCaisse({ societe: societe(), personne: undefined, items: [echoItem()] });
  expect(rep.nature).toBe('ticket_moderateur');
  expect(rep.brut).toBe(22_000);
  expect(rep.partSociete).toBe(17_600);
  expect(rep.ticketModerateur).toBe(4_400);
  expect(rep.aEncaisser).toBe(true);
  // Invariant : le prix « avec ticket » (17 600) est bien ce que paie la société.
  expect(rep.partSociete + rep.ticketModerateur).toBe(rep.brut);
});

test('caisse société JIRAMA : pièce par pièce — échographie + médicaments', () => {
  const lot = repartirLotCaisse({
    societe: societe(), personne: undefined,
    factures: [
      { id: 'inv-medicaments', items: [medsItem()] },
      { id: 'inv-echo', items: [echoItem()] },
    ],
  });
  // Médicaments : brut 4 500, ticket 30 % = 1 350, société 3 150.
  expect(lot.parFacture[0]).toMatchObject({ brut: 4_500, partSociete: 3_150, ticketModerateur: 1_350 });
  // Échographie : brut 22 000, ticket 20 % = 4 400, société 17 600 (prix avec ticket).
  expect(lot.parFacture[1]).toMatchObject({ brut: 22_000, partSociete: 17_600, ticketModerateur: 4_400 });
  // Totaux : 26 500 brut, 20 750 crédit société, 5 750 à encaisser (une seule fois).
  expect(lot.total.brut).toBe(26_500);
  expect(lot.total.partSociete).toBe(20_750);
  expect(lot.total.ticketModerateur).toBe(5_750);
  expect(lot.total.brut).toBe(lot.total.partSociete + lot.total.ticketModerateur);
});

test('caisse société JIRAMA : une répartition identique pour chaque facture', () => {
  // La même ligne répartie seule ou en lot donne le même net société : aucun
  // montant n'est recompté au moment de l'encaissement.
  const seule = repartirItemsCaisse({ societe: societe(), personne: undefined, items: [echoItem(), medsItem()] });
  expect(seule.brut).toBe(26_500);
  expect(seule.partSociete).toBe(20_750);
  expect(seule.ticketModerateur).toBe(5_750);
  const taux = Math.round((seule.partSociete / seule.brut) * 100);
  expect(taux).toBe(78);
});

test('prescriptions en attente : JAMAIS fusionnées, même au nom de la même personne', () => {
  // Deux analyses en attente du MÊME patient (patient revenu : 01/09 et 08/09),
  // telles qu'elles s'affichent à la caisse : « Analyses — 01/09/2026 » et
  // « Analyses — 08/09/2026 », chacune avec son brut et sa quote-part.
  const lignes = (montant: number): InvoiceItem[] => ([{
    code: 'LAB', description: 'Analyses — NFS + ionogramme', quantity: 1,
    unitPrice: montant, amount: montant, category: 'lab',
  }]);
  const lot = repartirLotCaisse({
    societe: societe({ tauxCouvertureDefaut: 100 }), personne: undefined,
    factures: [
      { id: 'inv-analyses-0109', items: lignes(36_500) },
      { id: 'inv-analyses-0809', items: lignes(33_500) },
    ],
  });
  // Chaque prescription garde SA répartition : rien n'est cumulé dans une pièce.
  expect(lot.parFacture).toHaveLength(2);
  expect(lot.parFacture[0]).toMatchObject({ brut: 36_500, partSociete: 36_500, ticketModerateur: 0 });
  expect(lot.parFacture[1]).toMatchObject({ brut: 33_500, partSociete: 33_500, ticketModerateur: 0 });
  // Le MONTANT EN CRÉDIT SOCIÉTÉ est UN SEUL total (70 000) — jamais un montant
  // par pièce séparée — tandis que les pièces restent bien distinctes.
  expect(lot.total.brut).toBe(70_000);
  expect(lot.total.partSociete).toBe(70_000);
  expect(lot.total.partSociete).toBe(lot.parFacture.reduce((s, r) => s + r.partSociete, 0));
});

/**
 * AUCUNE REMISE INVENTÉE SUR UN TICKET SOCIÉTÉ (cas signalé) :
 * pièce en attente créée pour une société, montant 36 500,00 Ar, AUCUNE remise
 * saisie, mais l'ancien ticket imprimait « Remise − 36 500,00 Ar » et
 * « TOTAL CRÉDIT SOCIÉTÉ 0,00 Ar ». Ces pièces sont enregistrées avec
 * `patientCharge: 0` : le crédit société doit alors être le brut de la pièce.
 */
test('ticket société sans remise : le crédit société est le montant, jamais une remise', () => {
  const piece: Invoice = {
    id: 'inv-0109', patientId: 'pat-1021', clientType: 'societe', clientName: 'RAZAFINDRAKOTO TIANA',
    items: [
      { description: 'Consultation Générale', quantity: 1, unitPrice: 13_500, amount: 13_500, category: 'consultation' },
      { description: 'Ionogramme sanguin', quantity: 1, unitPrice: 13_000, amount: 13_000, category: 'lab' },
      { description: 'Sérologie VIH / Syphilis', quantity: 1, unitPrice: 10_000, amount: 10_000, category: 'lab' },
    ],
    totalAmount: 36_500, patientCharge: 0, creditSociete: true,
    numeroFacture: '26FA0901001', status: 'paid', createdAt: '2026-09-01T08:41:29.000Z',
    paidAt: '2026-09-19T07:34:16.000Z', isExternal: false,
  };
  const html = paymentTicketHtml(settings(), piece);
  expect(html).toContain('FACTURE — PRISE EN CHARGE (CRÉDIT SOCIÉTÉ)');
  expect(html).toContain('TOTAL CRÉDIT SOCIÉTÉ');
  // Le montant porté au crédit de la société = le montant de la pièce.
  expect(html).toContain(`TOTAL CRÉDIT SOCIÉTÉ</td><td class="amount">${money(36_500)}`);
  // AUCUNE remise inventée : aucune ligne « Remise » sur un ticket société.
  expect(html).not.toContain('Remise');
  expect(html).not.toContain('Participation');

  // Pièce société dont le ticket modérateur est encaissé en espèces : le crédit
  // reste la part société (jamais une remise).
  const avecTicket: Invoice = {
    ...piece, totalAmount: 26_500, patientCharge: 20_750,
    copayTicketModerateur: {
      brut: 26_500, partSociete: 20_750, montant: 5_750, natureRemise: 'ticket_moderateur', societeNom: 'JIRAMA',
    },
  };
  const html2 = paymentTicketHtml(settings(), avecTicket);
  expect(html2).toContain(`Participation assuré (espèces)</td><td class="amount">${money(5_750)}`);
  expect(html2).toContain(`TOTAL CRÉDIT SOCIÉTÉ</td><td class="amount">${money(20_750)}`);
  expect(html2).not.toContain('Remise');
});
