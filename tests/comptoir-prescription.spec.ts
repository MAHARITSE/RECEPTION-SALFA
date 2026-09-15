import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import { collectBillingDocuments } from '../src/modules/assurance/monthlyBilling';
import { mergedBillingPrintHtml } from '../src/modules/assurance/printBilling';
import { deltaStockVentesOmises } from '../src/modules/assurance/utils/stockVentesOmises';
import type { LignePrestation } from '../src/modules/assurance/types';

function base(): AppState {
  const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  return {
    ...seed,
    companies: [], patients: [],
    invoices: [{
      id: 'invoice-1', clientType: 'comptoir', isExternal: false, clientName: 'TEST AJOUTS',
      numeroFacture: '26FA0915999', createdAt: '2026-09-15T08:00:00Z',
      totalAmount: 10000, patientCharge: 10000, status: 'paid',
      items: [{ description: 'Consultation', category: 'consultation', amount: 10000 }],
      ajoutsFacturier: [
        { id: 'a1', code: 'MEDIC', libelle: 'AMOXICILLINE 1G', quantity: 2, prixUnitaire: 2000, totalPrestation: 4000, ticketModerateur: 0, origine: 'omission', articleId: 'art-002' },
        { id: 'a2', code: 'LAB', libelle: 'NFS EXTERNE', quantity: 1, prixUnitaire: 5000, totalPrestation: 5000, ticketModerateur: 500, origine: 'ordonnance_externe' },
      ],
    }],
    ventes: [], venteLines: [], ventePayments: [], companyBillingAccounts: [],
    assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [],
  };
}

const ligne = (overrides: Partial<LignePrestation> = {}): LignePrestation => ({
  id: 'l1', prestationId: 'p', code: 'MEDIC', libelle: 'X', totalPrestation: 4000, totalPaye: 0,
  origine: 'omission', articleId: 'art-002', quantity: 2, ...overrides,
});

test('comptoir : les ajouts du facturier se superposent à la pièce, facture Caisse intacte', () => {
  const state = base();
  const doc = collectBillingDocuments(state).find(d => d.id === 'caisse:invoice-1')!;
  expect(doc).toBeTruthy();
  // Lignes : 1 Caisse + 2 ajouts, avec qté / P.U. repris pour l'impression.
  expect(doc.items).toHaveLength(3);
  expect(doc.items.map(i => i.description)).toEqual(['Consultation', 'AMOXICILLINE 1G', 'NFS EXTERNE']);
  expect(doc.items[1]).toMatchObject({ quantity: 2, unitPrice: 2000, amount: 4000 });
  expect(doc.items.every(i => (i.actCode || '').trim() !== '')).toBe(true);
  // Totaux : brut 19 000, ticket modérateur 500, net 18 500, encaissé inchangé.
  expect(doc.total).toBe(19000);
  expect(doc.copay).toBe(500);
  expect(doc.payable).toBe(18500);
  expect(doc.paid).toBe(10000);
  expect(doc.individualGross).toBe(19000);
  expect(doc.individualNet).toBe(18500);
  // La facture Caisse d'origine reste intacte.
  expect(state.invoices[0].items).toHaveLength(1);
  expect(state.invoices[0].totalAmount).toBe(10000);
  // La facture fusionnée reprend les lignes ajoutées.
  expect(mergedBillingPrintHtml(state, [doc], 'TEST AJOUTS')).toContain('AMOXICILLINE 1G');
});

test('comptoir : stock régularisé pour les omissions, jamais pour les ordonnances externes', () => {
  const omission = ligne();
  const ordonnance = ligne({ id: 'l2', origine: 'ordonnance_externe', articleId: undefined, quantity: 1 });
  // Ajout : sortie de stock pour l'omission reliée, rien pour l'ordonnance externe.
  expect(deltaStockVentesOmises({ lignes: [] } as never, { lignes: [omission, ordonnance] } as never))
    .toEqual([{ articleId: 'art-002', libelle: 'X', qte: 2 }]);
  // Suppression : restauration du stock.
  expect(deltaStockVentesOmises({ lignes: [omission] } as never, { lignes: [] } as never))
    .toEqual([{ articleId: 'art-002', libelle: 'X', qte: -2 }]);
  // Correction de quantité : seul le delta bouge.
  expect(deltaStockVentesOmises({ lignes: [omission] } as never, { lignes: [{ ...omission, quantity: 5 }] } as never))
    .toEqual([{ articleId: 'art-002', libelle: 'X', qte: 3 }]);
});

/* ===== Test UI : prescription d'une facture externe (omis / ordonnances) ===== */

async function setup(page: Page) {
  const state = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(state)) if (Array.isArray(value)) (state as unknown as Record<string, unknown>)[key] = [];
  state.users = [{ id: 'billing-test', name: 'Facturation Test', role: 'billing', password: 'test123' }];
  state.currentUser = state.users[0];
  state.patients = [];
  state.articles = [{
    id: 'art-amoxtest', name: 'AMOXTEST 500mg', family: 'MEDIC', unit: 'unité',
    priceComptoir: 1800, priceSociete: 1900, priceExterne: 2000, purchasePrice: 1000,
    stockCentral: 100, stockPharmacie: 50, minStockCentral: 5, minStockPharmacie: 5,
  }];
  state.invoices = [{
    id: 'ext-1', numeroFacture: '26FA0910001', clientName: 'Client Externe', clientType: 'externe', isExternal: true,
    createdAt: '2026-09-10T08:00:00Z', totalAmount: 10000, patientCharge: 10000, status: 'paid',
    items: [{ category: 'consultation', description: 'Consultation', quantity: 1, unitPrice: 10000, amount: 10000 }],
  }];
  state.ventes = [];
  state.venteLines = [];
  state.monthlyInvoices = [];
  await page.addInitScript(() => {
    window.print = () => {
      const html = document.documentElement.outerHTML;
      const cible = (window === window.parent ? window : window.parent) as unknown as { __printsHtml: string[] };
      cible.__printsHtml = cible.__printsHtml || [];
      cible.__printsHtml.push(html);
      window.dispatchEvent(new Event('beforeprint'));
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 10);
    };
  });
  await page.route('**/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Tests</body></html>' }));
  await page.goto('/'); await page.unroute('**/');
  await page.evaluate(async s => { const db = await import('/src/browserDb.ts'); await db.saveStateToBrowser(s); }, state);
}

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption('billing-test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('test123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.locator('#nav-tab-comptoir').click();
}

async function browserState(page: Page) {
  return page.evaluate(async () => (await import('/src/browserDb.ts')).loadStateFromBrowser());
}

test('UI : omissions et ordonnances externes sur une facture externe, fusion et stock', async ({ page }) => {
  await setup(page); await login(page);
  const dossiers = page.getByRole('table', { name: 'Dossiers clients comptoir & externes' });
  await dossiers.getByRole('cell', { name: 'Client Externe' }).first().dblclick();
  const fiche = page.getByRole('dialog', { name: 'Factures de Client Externe' });
  await expect(fiche).toBeVisible();

  // Double-clic sur le n° facture → prescription (lignes Caisse verrouillées).
  await fiche.getByRole('cell', { name: '26FA0910001' }).dblclick();
  const modal = page.getByRole('dialog', { name: 'Prescription 26FA0910001' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('🔒 Consultation');

  // Saisie d'une vente omise depuis le catalogue (tarif externe : 2 000).
  await modal.getByPlaceholder(/Saisir l.acte/).fill('amoxtest');
  await modal.getByPlaceholder(/Saisir l.acte/).press('Enter');
  await modal.locator('#presc-qty-input').fill('3');
  await modal.getByRole('button', { name: /Enregistrer la ligne/ }).click();
  await expect(modal).toContainText('AMOXTEST 500mg');
  await modal.getByRole('button', { name: /Enregistrer la prescription/ }).click();
  await expect(modal).toHaveCount(0);

  // Badge +1 sur la fiche, total 16 000, stock pharmacie régularisé (50 → 47).
  await expect(fiche.getByText('+1')).toBeVisible();
  await expect.poll(async () => (await browserState(page))?.invoices[0].ajoutsFacturier?.length).toBe(1);
  const apres = await browserState(page);
  expect(apres?.invoices[0].ajoutsFacturier).toHaveLength(1);
  expect(apres?.invoices[0].ajoutsFacturier[0]).toMatchObject({ origine: 'omission', quantity: 3, totalPrestation: 6000 });
  expect(apres?.invoices[0].items).toHaveLength(1); // lignes Caisse intactes
  expect(apres?.articles.find(a => a.id === 'art-amoxtest')?.stockPharmacie).toBe(47);

  // La fusion reprend la ligne omise.
  await fiche.getByRole('checkbox', { name: 'Tout sélectionner' }).check();
  await fiche.getByRole('button', { name: /Fusionner en une seule facture/ }).click();
  const nomModal = page.getByRole('dialog', { name: 'Nom du client pour la facture' });
  await nomModal.getByLabel('Nom à mettre sur la facture').fill('RAKOTO Jeanne');
  await nomModal.getByRole('button', { name: /Imprimer la facture/ }).click();
  await expect.poll(async () => page.evaluate(() => ((window as unknown as { __printsHtml?: string[] }).__printsHtml || []).join(''))).toContain('AMOXTEST 500mg');

  // Ordonnance externe : aucun impact stock (reste 47).
  await fiche.getByRole('button', { name: 'Prescription de la facture 26FA0910001' }).click();
  const modal2 = page.getByRole('dialog', { name: 'Prescription 26FA0910001' });
  await modal2.locator('select').first().selectOption('ordonnance_externe');
  await modal2.getByPlaceholder(/Saisir l.acte/).fill('amoxtest');
  await modal2.getByPlaceholder(/Saisir l.acte/).press('Enter');
  await modal2.getByRole('button', { name: /Enregistrer la ligne/ }).click();
  await modal2.getByRole('button', { name: /Enregistrer la prescription/ }).click();
  await expect(modal2).toHaveCount(0);
  await expect(fiche.getByText('+2')).toBeVisible();
  await expect.poll(async () => (await browserState(page))?.invoices[0].ajoutsFacturier?.length).toBe(2);
  expect((await browserState(page))?.articles.find(a => a.id === 'art-amoxtest')?.stockPharmacie).toBe(47);

  // Suppression des 2 lignes : stock restauré (47 → 50), badge disparu.
  await fiche.getByRole('button', { name: 'Prescription de la facture 26FA0910001' }).click();
  const modal3 = page.getByRole('dialog', { name: 'Prescription 26FA0910001' });
  for (let i = 0; i < 2; i++) {
    await modal3.getByRole('row', { name: /AMOXTEST/ }).first().click();
    await modal3.getByRole('button', { name: 'Supprimer', exact: true }).click();
  }
  await modal3.getByRole('button', { name: /Enregistrer la prescription/ }).click();
  await expect(modal3).toHaveCount(0);
  await expect(fiche.getByText('+2')).toHaveCount(0);
  await expect(fiche.getByText('+1')).toHaveCount(0);
  await expect.poll(async () => (await browserState(page))?.invoices[0].ajoutsFacturier?.length).toBe(0);
  const fin = await browserState(page);
  expect(fin?.invoices[0].ajoutsFacturier).toHaveLength(0);
  expect(fin?.articles.find(a => a.id === 'art-amoxtest')?.stockPharmacie).toBe(50);
});
