import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import type { Invoice, Vente } from '../src/types';
import { billingTotals, collectBillingDocuments, createMonthlyInvoice, localBillingDate, monthlyGroups, preserveMonthlyInvoices } from '../src/modules/assurance/monthlyBilling';
import { billingPrintHtml, individualBillingPrintHtml, billingAmountInWords } from '../src/modules/assurance/printBilling';
import { groupBillingItemsByFamily, billingFamilyResolver, auditArticleFamilies } from '../src/modules/assurance/billingFamilies';
import { planMonthlyFamilyRepair, applyMonthlyFamilyRepair, reorganizeFamilyMetadata } from '../src/modules/assurance/billingFamilyRepair';
import { mergeStates } from '../src/syncMerge';

function fixture(): AppState {
  const state = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  const patient = state.patients[0];
  for (const [key, value] of Object.entries(state)) if (Array.isArray(value)) (state as unknown as Record<string, unknown>)[key] = [];
  state.users = [{ id: 'billing-test', name: 'Facturation Test', role: 'billing', password: 'test123' }];
  state.currentUser = state.users[0];
  state.ticketSettings = { ...state.ticketSettings, assuranceHeader: undefined };
  state.companies = [{ id: 'soc-A', name: 'SOCIETE A', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance' }, { id: 'soc-B', name: 'SOCIETE B', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance' }];
  state.patients = [{ ...patient, id: 'patient-A', company: 'SOCIETE A', clientType: 'societe', lastName: 'RAKOTO', firstName: 'TEST' }];
  const invoice = (id: string, clientType: Invoice['clientType'], date = '2026-09-10T08:00:00Z'): Invoice => ({ id, clientType, clientName: id === 'soc-B' ? 'SOCIETE B' : undefined, patientId: 'patient-A', createdAt: date, isExternal: clientType === 'externe', totalAmount: 10000, patientCharge: 10000, status: 'paid', creditSociete: clientType === 'societe', items: [{ category: 'consultation', description: 'Consultation & soins <test>', amount: 10000 }] });
  state.invoices = [invoice('comptoir-1', 'comptoir'), invoice('comptoir-2', 'comptoir'), invoice('external', 'externe'), invoice('soc-A', 'societe'), invoice('soc-B', 'societe'), invoice('old-counter', 'comptoir', '2026-08-10T08:00:00Z')];
  const sale = (id: string, category: Vente['clientType'] = 'comptoir'): Vente => ({ id, numeroFacture: `FAC-${id}`, clientType: category, type: 'consultation', subtotal: 4000, montantFacture: 4000, montantPaye: 1000, status: 'partiel', isExterne: category === 'externe', source: 'caisse', dateVente: '2026-09-12', createdAt: '2026-09-12' });
  state.ventes = [{ ...sale('mirror'), legacyInvoiceId: 'comptoir-1' }, sale('standalone', 'externe'), { ...sale('cancelled'), status: 'annule' }];
  state.venteLines = [{ id: 'line', venteId: 'standalone', articleName: 'Analyse', category: 'lab', quantity: 2, unitPrice: 2000, discount: 0 }];
  state.assurancePrestations = []; state.assurancePaiements = []; state.monthlyInvoices = [];
  return state;
}
const scope = { month: '2026-09', category: 'comptoir' as const };

test('groupes mensuels distincts, pas de doublons ni ventes annulées, crédit société non encaissé', () => {
  const state = fixture(), before = structuredClone(state), docs = collectBillingDocuments(state);
  expect(docs).toHaveLength(7);
  expect(monthlyGroups(docs)).toHaveLength(5);
  expect(docs.filter(d => d.category === 'societe').map(d => d.paid)).toEqual([0, 0]);
  expect(billingTotals(docs.filter(d => d.category === 'externe'))).toMatchObject({ total: 14000, paid: 11000, remaining: 3000 });
  expect(docs.find(d => d.sourceId === 'comptoir-1')?.number).toBe('FAC-mirror');
  expect(docs.some(d => d.sourceId === 'cancelled')).toBe(false);
  expect(state).toEqual(before);
  expect(localBillingDate('2026-08-31T22:30:00Z')).toBe('2026-09-01');
  state.invoices.find(i => i.id === 'soc-A')!.createdAt = '2026-08-31T22:30:00Z';
  expect(collectBillingDocuments(state).find(d => d.sourceId === 'soc-A')?.date).toBe('2026-09-01');
});

test('numéro séquentiel par mois, snapshot figé, fusion non destructive et impression échappée', () => {
  const state = fixture();
  state.invoices[0].clientName = 'Consultation & soins <test>';
  const invoice = createMonthlyInvoice(state, scope, []);
  expect(invoice).toMatchObject({ number: 'FM-2026-09-0001', total: 20000, paid: 20000, remaining: 0 });
  const html = billingPrintHtml(invoice);
  expect(html).toContain('Consultation &amp; soins &lt;test&gt;');
  expect(html).not.toContain('<test>');
  const external = createMonthlyInvoice(state, { ...scope, category: 'externe' }, [invoice]);
  expect(external.number).toBe('FM-2026-09-0002');
  expect(createMonthlyInvoice(state, { month: '2026-08', category: 'comptoir' }, [invoice, external]).number).toBe('FM-2026-08-0001');
  state.invoices = [];
  state.ticketSettings.facilityName = 'Changed';
  expect(createMonthlyInvoice(state, scope, [invoice])).toBe(invoice);
  expect(billingPrintHtml(invoice)).toBe(html);
  expect(preserveMonthlyInvoices([invoice], [{ ...invoice, total: 99 }])).toEqual([invoice]);
  expect(mergeStates(state, state, { ...state, monthlyInvoices: [invoice] }).monthlyInvoices).toEqual([invoice]);
  expect(mergeStates(state, { ...state, monthlyInvoices: [invoice] }, state).monthlyInvoices).toEqual([invoice]);
});

test('émission refuse montants invalides, mois vides et utilisateurs non habilités', () => {
  const state = fixture();
  expect(() => createMonthlyInvoice(state, { month: '2026-13', category: 'comptoir' }, [])).toThrow('Mois');
  expect(() => createMonthlyInvoice(state, { month: '2025-01', category: 'comptoir' }, [])).toThrow('Aucune');
  state.invoices[0].totalAmount = NaN;
  expect(() => createMonthlyInvoice(state, scope, [])).toThrow('montant');
  state.currentUser = null;
  expect(() => createMonthlyInvoice(state, scope, [])).toThrow('Connexion');
});

async function emptyOrigin(page: Page) {
  await page.route('**/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Tests</body></html>' }));
  await page.goto('/'); await page.unroute('**/');
}
async function setup(page: Page) {
  await page.addInitScript(() => {
    if (window === window.parent) (window as any).__monthlyPrints = [];
    window.print = () => {
      (window.parent as any).__monthlyPrints.push(document.documentElement.outerHTML);
      window.dispatchEvent(new Event('beforeprint'));
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 10);
    };
  });
  await emptyOrigin(page);
  await page.evaluate(async state => { const db = await import('/src/browserDb.ts'); await db.saveStateToBrowser(state); }, fixture());
}
async function read(page: Page) {
  return page.evaluate(async () => (await import('/src/browserDb.ts')).loadStateFromBrowser());
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption('billing-test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('test123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.locator('#nav-tab-prestations').click();
  await expect.poll(async () => (await read(page))?.ventes.length).toBeGreaterThan(0);
}

test('UI : vues séparées, impression mensuelle durable, réimpression après rechargement et impression individuelle', async ({ page }) => {
  await setup(page); await login(page);
  await expect(page.getByTestId('monthly-invoices-view')).toBeVisible();
  await expect(page.getByTestId('billing-detail-view')).toHaveCount(0);
  await page.getByLabel('Mois de facturation').fill('2026-09');
  // Facturation : sociétés uniquement (comptoir & externes regroupés à part).
  await expect(page.getByRole('tab', { name: /Vue par Facture/ })).toContainText('2');
  await expect(page.getByRole('tab', { name: /Vue Détaillée/ })).toContainText('2');
  const before = await read(page);
  await page.locator('#nav-tab-comptoir').click();
  await expect(page.getByTestId('comptoir-invoices-view')).toBeVisible();
  await page.getByLabel('Mois comptoir & externe').fill('2026-09');
  await page.getByRole('button', { name: /^Imprimer la facture mensuelle 2026-09 Clients Comptoir$/ }).click();
  await expect(page.getByRole('status')).toContainText('FM-2026-09-0001');
  await expect.poll(() => page.evaluate(() => (window as any).__monthlyPrints.length)).toBe(1);
  const after = await read(page);
  expect(after?.monthlyInvoices).toHaveLength(1);
  for (const key of ['invoices', 'ventes', 'ventePayments', 'cashClosings', 'stockMovements', 'companyBillingAccounts', 'assurancePaiements'] as const) expect(after?.[key]).toEqual(before?.[key]);
  const frozen = after!.monthlyInvoices![0];
  await page.getByRole('button', { name: /^Réimprimer la facture mensuelle 2026-09/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__monthlyPrints.length)).toBe(2);
  expect((await read(page))?.monthlyInvoices).toEqual([frozen]);
  await login(page);
  await page.locator('#nav-tab-comptoir').click();
  await page.getByRole('button', { name: /^Réimprimer la facture mensuelle 2026-09/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__monthlyPrints.length)).toBe(1);
  expect((await read(page))?.monthlyInvoices).toEqual([frozen]);
  await page.getByRole('tab', { name: /Vue Détaillée/ }).click();
  await expect(page.getByTestId('comptoir-invoices-view')).toHaveCount(0);
  await expect(page.getByTestId('comptoir-detail-view')).toBeVisible();
  await page.getByRole('button', { name: /^Imprimer la facture FAC-mirror$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__monthlyPrints.length)).toBe(2);
  expect((await read(page))?.monthlyInvoices).toEqual([frozen]);
  await expect(page.getByRole('table', { name: 'Factures détaillées clients' })).toContainText('Analyse');
});

test('transaction : deux onglets, séquence intercatégories, autosauvegarde périmée et sources modifiées', async ({ page, context }) => {
  await setup(page);
  const other = await context.newPage(); await emptyOrigin(other);
  const issue = (p: Page, category: 'comptoir' | 'externe') => p.evaluate(async ({ state, category }) => (await import('/src/browserDb.ts')).issueMonthlyInvoiceInBrowser(state, { month: '2026-09', category }), { state: fixture(), category });
  const [a, b, c] = await Promise.all([issue(page, 'comptoir'), issue(other, 'comptoir'), issue(other, 'externe')]);
  expect(a).toEqual(b);
  expect(new Set([a.number, c.number]).size).toBe(2);
  expect((await read(page))?.monthlyInvoices).toHaveLength(2);
  // Ordinary saves must not erase or rewrite archived numbers/content.
  await page.evaluate(async state => { const db = await import('/src/browserDb.ts'); state.invoices = []; state.monthlyInvoices = []; await db.saveStateToBrowser(state); }, fixture());
  expect((await read(page))?.monthlyInvoices).toHaveLength(2);
  const reprint = await issue(other, 'comptoir');
  expect(reprint).toEqual(a);
  expect((await read(page))?.invoices).toEqual([]);
});

test('échec de persistance : aucune impression ni numéro consommé', async ({ page }) => {
  await setup(page); await login(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).__restoreMonthlyPut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.state?.monthlyInvoices?.length) throw new DOMException('Disque plein test', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await page.locator('#nav-tab-comptoir').click();
  await page.getByRole('button', { name: /^Imprimer la facture mensuelle 2026-09 Clients Comptoir$/ }).click();
  await expect(page.getByRole('alert')).toContainText('Impression mensuelle non lancée');
  expect((await read(page))?.monthlyInvoices).toEqual([]);
  expect(await page.evaluate(() => (window as any).__monthlyPrints.length)).toBe(0);
  await page.evaluate(() => (window as any).__restoreMonthlyPut());
  await page.getByRole('button', { name: /^Imprimer la facture mensuelle 2026-09 Clients Comptoir$/ }).click();
  await expect(page.getByRole('status')).toContainText('FM-2026-09-0001');
});

test('refuse de figer une vue non synchronisée avec les pièces durables', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async state => {
    state.invoices[0].totalAmount = 15000;
    try { await (await import('/src/browserDb.ts')).issueMonthlyInvoiceInBrowser(state, { month: '2026-09', category: 'comptoir' }); return ''; }
    catch (error) { return (error as Error).message; }
  }, fixture());
  expect(result).toContain('synchronisation');
  expect((await read(page))?.monthlyInvoices).toEqual([]);
});


test('filtre garant unique : les deux vues, les compteurs et les impressions suivent la sélection et Réinitialiser', async ({ page }) => {
  await setup(page); await login(page);
  await expect(page.getByRole('tablist', { name: 'Catégories de clients' })).toHaveCount(0);
  for (const name of [/^Sociétés \d/, /^Comptoir \d/, /^Externes \d/]) await expect(page.getByRole('tab', { name })).toHaveCount(0);
  await page.getByLabel('Mois de facturation').fill('2026-09');
  const monthly = page.getByRole('table', { name: 'Factures mensuelles', exact: true });
  await expect(monthly.locator('tbody tr')).toHaveCount(2);
  // L'archive Comptoir se gère dans l'onglet dédié Comptoir & Externe.
  await page.locator('#nav-tab-comptoir').click();
  await page.getByLabel('Mois comptoir & externe').fill('2026-09');
  await page.getByRole('button', { name: /^Imprimer la facture mensuelle 2026-09 Clients Comptoir$/ }).click();
  await expect(page.getByRole('status')).toContainText('FM-2026-09-0001');
  await page.locator('#nav-tab-prestations').click();
  await page.getByLabel('Mois de facturation').fill('2026-09');
  await page.getByLabel('Société / Garant', { exact: true }).selectOption('soc-A');
  await expect(monthly.locator('tbody tr')).toHaveCount(1);
  await expect(monthly).toContainText('SOCIETE A');
  await expect(monthly).not.toContainText('SOCIETE B');
  await expect(monthly).not.toContainText('Clients Comptoir');
  await expect(monthly).not.toContainText('Clients Externes');
  await expect(page.getByRole('tab', { name: /Vue par Facture/ })).toContainText('1');
  await expect(page.getByRole('tab', { name: /Vue Détaillée/ })).toContainText('1');
  await page.getByRole('button', { name: /^Imprimer la facture mensuelle 2026-09 SOCIETE A$/ }).click();
  const archive = (await read(page))!.monthlyInvoices!;
  expect(archive.find(i => i.companyId === 'soc-A')!.documents.map(d => d.sourceId)).toEqual(['soc-A']);
  await page.getByRole('tab', { name: /Vue Détaillée/ }).click();
  await expect(page.getByRole('button', { name: 'Imprimer la facture soc-A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer la facture soc-B', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imprimer la facture FAC-mirror', exact: true })).toHaveCount(0);
  await page.getByLabel('Société / Garant', { exact: true }).selectOption('soc-B');
  await expect(page.getByRole('button', { name: 'Imprimer la facture soc-B', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer la facture soc-A', exact: true })).toHaveCount(0);
  await page.locator('#btn-reset-filter').click();
  await expect(page.getByLabel('Société / Garant', { exact: true })).toHaveValue('ALL');
  await expect(page.getByRole('tab', { name: /Vue Détaillée/ })).toContainText('2');
  await expect(page.getByRole('button', { name: 'Imprimer la facture soc-A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer la facture FAC-mirror', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /Vue par Facture/ }).click();
  await expect(monthly.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Réimprimer la facture mensuelle 2026-09 Clients Comptoir$/ })).toHaveCount(0);
  await page.locator('#nav-tab-comptoir').click();
  await expect(page.getByRole('button', { name: /^Réimprimer la facture mensuelle 2026-09 Clients Comptoir$/ })).toBeVisible();
  expect((await read(page))!.monthlyInvoices).toEqual(archive);
});


test('modèle individuel avec entête commun : articles, quantités, prix et net de la pièce, distinct du net société', async ({ page }) => {
  const state = fixture();
  const invoice = state.invoices.find(i => i.id === 'soc-A')!;
  invoice.items = [
    { category: 'pharmacy', description: 'MAALOX SCHT BTE/20', quantity: 20, unitPrice: 2300, amount: 46000 },
    { category: 'pharmacy', description: 'DEXAMETHASONE INJ 4MG', quantity: 20, unitPrice: 600, amount: 12000 },
  ];
  invoice.createdAt = '2026-04-27T08:00:00Z';
  invoice.totalAmount = 58000; invoice.patientCharge = 14500;
  invoice.assuranceSuivi = { montantARembourser: 43500 };
  const before = structuredClone(state);
  const document = collectBillingDocuments(state).find(d => d.sourceId === invoice.id)!;
  expect(document).toMatchObject({ individualGross: 58000, individualNet: 14500, copay: 14500, payable: 43500 });
  const html = individualBillingPrintHtml(state, document, '2026-09-10T08:00:00Z');
  await page.setContent(html);
  await expect(page.getByRole('heading', { name: 'FACTURE soc-A' })).toBeVisible();
  await expect(page.locator('body')).toContainText('Date de consultation : 27/04/2026');
  await expect(page.locator('body')).toContainText('Date de facture : 10/09/2026');
  await expect(page.locator('body')).toContainText('Prise en charge : SOCIETE A');
  for (const label of ['N°', 'Libellé Article', 'Qté', 'Prix', 'Montant']) await expect(page.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /MAALOX/ })).toContainText('20,00');
  await expect(page.getByRole('row', { name: /MAALOX/ })).toContainText('2 300,00');
  await expect(page.getByRole('row', { name: /Total Brut/ })).toContainText('58 000,00');
  await expect(page.getByRole('row', { name: /Remise\/Participation/ })).toContainText('43 500,00');
  await expect(page.getByRole('row', { name: /Net à payer/ })).toContainText('14 500,00');
  await expect(page.locator('body')).toContainText('quatorze mille cinq cents Ariary');
  await expect(page.locator('header, img, svg')).toHaveCount(0);
  await expect(page.locator('.invoice-header')).toContainText(state.ticketSettings.facilityName);
  expect(state).toEqual(before);
});

test('modèle société : matricule, sous-entité, regroupement des actes et total avant règlements', async ({ page }) => {
  const state = fixture();
  state.patients[0].matricule = 'MAT-108350';
  state.patients[0].subCompany = 'PROJET & SOINS <test>';
  const source = state.invoices.find(i => i.id === 'soc-A')!;
  source.items = [{ category: 'pharmacy', description: 'Médicament A', amount: 6000 }, { category: 'pharmacy', description: 'Médicament B', amount: 2000 }, { category: 'consultation', description: 'Consultation', amount: 2000 }];
  source.assuranceSuivi = { montantARembourser: 8000 };
  const invoice = createMonthlyInvoice(state, { month: '2026-09', category: 'societe', companyId: 'soc-A' }, [], '2026-09-10T08:00:00Z');
  const frozen = structuredClone(invoice);
  await page.setContent(billingPrintHtml(invoice));
  await expect(page.getByRole('heading', { name: 'Doit : SOCIETE A' })).toBeVisible();
  await expect(page.locator('body')).toContainText('Mois de prise en charge : Septembre 2026');
  await expect(page.locator('body')).toContainText('Facture N° : FM-2026-09-0001');
  for (const label of ['N°', 'Date', 'Mlle', 'Nom et Prénom', 'Acte médicale/Prix', 'Montant', 'Participat°', 'Net à Payer']) await expect(page.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
  await expect(page.locator('[data-source-id="soc-A"]')).toContainText('MAT-108350');
  await expect(page.locator('[data-source-id="soc-A"]')).toContainText('PROJET & SOINS <test>');
  await expect(page.locator('.acts')).toContainText('MEDIC : 8 000,00');
  await expect(page.locator('.acts')).toContainText('CONS : 2 000,00');
  await expect(page.locator('.grand-total')).toContainText('10 000,00');
  await expect(page.locator('.grand-total')).toContainText('2 000,00');
  await expect(page.locator('.grand-total')).toContainText('8 000,00');
  await expect(page.locator('header, img, svg, test')).toHaveCount(0);
  expect(invoice).toEqual(frozen);
});

test('anciens instantanés : famille inconnue explicite et champs individuels non inventés', async ({ page }) => {
  const state = fixture();
  const invoice = createMonthlyInvoice(state, scope, []);
  invoice.documents.forEach(d => {
    delete d.matricule; delete d.subCompany; delete d.individualNet; delete d.individualGross;
    d.items.forEach(i => { delete i.actCode; delete i.quantity; delete i.unitPrice; });
  });
  const frozen = structuredClone(invoice);
  const html = billingPrintHtml(invoice);
  expect(html).toContain('Famille non renseignée');
  expect(html).not.toContain('Consultation &amp; soins &lt;test&gt;');
  state.invoices = []; state.patients = [];
  expect(billingPrintHtml(createMonthlyInvoice(state, scope, [invoice]))).toBe(html);
  expect(invoice).toEqual(frozen);
  await page.setContent(billingPrintHtml(invoice, false));
  const row = page.getByRole('table', { name: 'Articles facturés' }).locator('tbody tr').first();
  await expect(row.locator('td').nth(2)).toHaveText('—');
  await expect(row.locator('td').nth(3)).toHaveText('—');
});

test('montants en lettres : zéro, accords, millions et centimes conservés', () => {
  expect(billingAmountInWords(14500, 'Ar')).toBe('quatorze mille cinq cents Ariary');
  expect(billingAmountInWords(0, 'Ar')).toBe('zéro Ariary');
  expect(billingAmountInWords(200000, 'Ar')).toBe('deux cent mille Ariary');
  expect(billingAmountInWords(80000, 'Ar')).toBe('quatre-vingt mille Ariary');
  expect(billingAmountInWords(2000000.25, 'Ar')).toBe('deux millions Ariary et vingt-cinq centimes');
  expect(billingAmountInWords(1.01, '€')).toBe('un euro et un centime');
  expect(billingAmountInWords(1000000000, 'Ar')).toBe('un milliard Ariary');
});


test('facture société longue : pagination A4 sans suppression des bénéficiaires', async ({ page }, testInfo) => {
  const state = fixture();
  const invoice = createMonthlyInvoice(state, scope, []);
  const document = invoice.documents[0];
  invoice.documents = Array.from({ length: 100 }, (_, i) => ({ ...document, id: `long-${i}`, sourceId: `long-${i}`, client: `BÉNÉFICIAIRE TEST ${i + 1} AVEC UN NOM LONG`, subCompany: 'PROJET DE DÉMONSTRATION' }));
  Object.assign(invoice, billingTotals(invoice.documents));
  const before = structuredClone(invoice);
  const html = billingPrintHtml(invoice);
  await page.setContent(html);
  await expect(page.locator('[data-source-id]')).toHaveCount(100);
  expect(html).toContain('thead{display:table-header-group}');
  expect(html).toContain('counter(page)');
  expect(html).toContain('counter(pages)');
  const pdf = await page.pdf({ path: testInfo.outputPath('facture-mensuelle-longue.pdf'), preferCSSPageSize: true, displayHeaderFooter: false });
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
  expect(invoice).toEqual(before);
});

test('vente autonome : remise de la pièce conservée dans le modèle individuel', async ({ page }) => {
  const state = fixture();
  const sale = state.ventes.find(v => v.id === 'standalone')!;
  sale.subtotal = 4000; sale.montantFacture = 3000;
  state.venteLines[0].discount = 25;
  const before = structuredClone(state);
  const document = collectBillingDocuments(state).find(d => d.sourceId === sale.id)!;
  await page.setContent(individualBillingPrintHtml(state, document));
  await expect(page.getByRole('row', { name: /Total Brut/ })).toContainText('4 000,00');
  await expect(page.getByRole('row', { name: /Remise\/Participation/ })).toContainText('1 000,00');
  await expect(page.getByRole('row', { name: /Net à payer/ })).toContainText('3 000,00');
  expect(state).toEqual(before);
});


test('actes regroupés par famille : alias normalisés, sommes exactes et détail individuel intact', () => {
  const items = [
    { description: 'Médicament A', actCode: 'PHAR', amount: 46000 },
    { description: 'Médicament B', actCode: ' medic ', amount: 12000 },
    { description: 'Analyse A', actCode: 'LAB', amount: 3000.25 },
    { description: 'Analyse B', actCode: 'labo', amount: 4000.75 },
    { description: 'Consultation', actCode: 'CONS', amount: 20000 },
    { description: 'Ancien article A', amount: 500 },
    { description: 'Ancien article B', actCode: ' ', amount: 1000 },
  ];
  const before = structuredClone(items);
  expect(groupBillingItemsByFamily(items)).toEqual([
    { family: 'MEDIC', amount: 58000 }, { family: 'LABO', amount: 7001 },
    { family: 'CONS', amount: 20000 }, { family: 'Famille non renseignée', amount: 1500 },
  ]);
  expect(items).toEqual(before);
});

test('famille réelle du catalogue prioritaire sur la catégorie générale, figée lors de l’émission', async ({ page }) => {
  const state = fixture();
  state.familles = [{ id: 'soins', code: 'SOINS', name: 'Soins', color: '#000' }];
  state.articles = [{ id: 'art-soins', code: 'ACT-001', name: 'Pansement', family: 'SOINS', unit: 'acte', priceComptoir: 5000, priceSociete: 5000, priceExterne: 5000, purchasePrice: 0, stockCentral: 0, stockPharmacie: 0 }];
  state.invoices.find(i => i.id === 'soc-A')!.items = [
    { code: 'ACT-001', description: 'Pansement A', category: 'consultation', amount: 6000 },
    { code: 'ACT-001', description: 'Pansement B', category: 'consultation', amount: 4000 },
  ];
  state.venteLines[0].articleId = 'art-soins'; state.venteLines[0].category = 'consultation';
  const docs = collectBillingDocuments(state);
  expect(docs.find(d => d.sourceId === 'standalone')!.items[0].actCode).toBe('SOINS');
  const invoice = createMonthlyInvoice(state, { month: '2026-09', category: 'societe', companyId: 'soc-A' }, []);
  const before = structuredClone(invoice);
  await page.setContent(billingPrintHtml(invoice));
  await expect(page.locator('.acts')).toHaveText('SOINS : 10 000,00');
  await expect(page.locator('.acts')).not.toContainText('Pansement');
  state.articles[0].family = 'CONS';
  expect(billingPrintHtml(createMonthlyInvoice(state, invoice, [invoice]))).toBe(billingPrintHtml(before));
  await page.setContent(individualBillingPrintHtml(state, invoice.documents[0]));
  await expect(page.getByRole('table', { name: 'Articles facturés' }).locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('table', { name: 'Articles facturés' })).toContainText('Pansement A');
  expect(invoice).toEqual(before);
});


test('article.code historique peut être un ID ; nom exact unique et famille obligatoire vérifiés', () => {
  const state = fixture();
  state.familles = [{ id: 'soins', code: 'SOINS', name: 'Soins', color: '#000' }];
  const article = { id: 'art-001', name: 'Pansement stérile', family: 'SOINS', code: 'PAN001', unit: 'acte', priceComptoir: 100, priceSociete: 100, priceExterne: 100, purchasePrice: 0, stockCentral: 0, stockPharmacie: 0 };
  state.articles = [article];
  expect(billingFamilyResolver(state)({ articleCode: 'art-001', category: 'pharmacy' })).toBe('SOINS');
  expect(billingFamilyResolver(state)({ articleName: ' PANSEMENT STÉRILE ' })).toBe('SOINS');
  expect(auditArticleFamilies(state)).toEqual([]);
  state.articles[0].family = '';
  expect(auditArticleFamilies(state)).toHaveLength(1);
  expect(billingFamilyResolver(state)({ articleCode: 'art-001', category: 'pharmacy' })).toBeUndefined();
  state.invoices[0].items[0].code = 'art-001';
  expect(() => createMonthlyInvoice(state, scope, [])).toThrow('Famille obligatoire');
  state.articles = [{ ...article, family: 'SOINS' }, { ...article, id: 'other', family: 'MEDIC' }];
  expect(billingFamilyResolver(state)({ articleName: 'Pansement stérile', category: 'pharmacy' })).toBeUndefined();
});

test('réparation explicite : seulement familles absentes, traçabilité et aucun changement financier', () => {
  const state = fixture();
  const original = createMonthlyInvoice(state, scope, []);
  original.documents.forEach(d => d.items.forEach(i => { delete i.actCode; }));
  const before = structuredClone(original);
  expect(planMonthlyFamilyRepair(state, original).entries).toHaveLength(2);
  const repaired = applyMonthlyFamilyRepair(state, original, '2026-09-10T12:00:00Z');
  expect(repaired.familyMetadataRepairs?.[0]).toMatchObject({ date: '2026-09-10T12:00:00Z', userId: state.currentUser!.id });
  expect(repaired.documents.flatMap(d => d.items.map(i => i.actCode))).toEqual(['CONS', 'CONS']);
  const cleaned = structuredClone(repaired);
  delete cleaned.familyMetadataRepairs;
  cleaned.documents.forEach(d => d.items.forEach(i => { delete i.actCode; }));
  expect(cleaned).toEqual(before);
  expect(original).toEqual(before);
  expect(planMonthlyFamilyRepair(state, repaired).entries).toHaveLength(0);
  // No guessed category from a medication-like name without a source/catalog match.
  state.invoices = []; state.articles = [];
  expect(planMonthlyFamilyRepair(state, original).unresolved).toHaveLength(2);
  expect(() => applyMonthlyFamilyRepair(state, original)).toThrow('Aucune famille');
});

async function writeLegacyState(page: Page, state: AppState) {
  await page.evaluate(async state => {
    const request = indexedDB.open('reception-salfa', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('application', 'readwrite');
      tx.objectStore('application').put({ state: { ...state, currentUser: null }, savedAt: Date.now() }, 'state');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }, state);
}

test('UI : base réorganisée automatiquement au chargement, aucun bouton de vérification ou réparation', async ({ page }) => {
  await setup(page);
  const state = fixture();
  const original = createMonthlyInvoice(state, scope, []);
  original.documents.forEach(d => d.items.forEach(i => { delete i.actCode; }));
  state.monthlyInvoices = [original];
  await writeLegacyState(page, state);
  await login(page);
  await expect(page.getByRole('button', { name: 'Vérifier les familles des articles', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rétablir les familles', exact: true })).toHaveCount(0);
  const repaired = (await read(page))!.monthlyInvoices![0];
  expect(repaired.number).toBe(original.number);
  expect(repaired.documents.flatMap(d => d.items.map(i => i.actCode))).toEqual(['CONS', 'CONS']);
  expect((await read(page))!.invoices).toEqual(state.invoices);
  expect(repaired.familyMetadataRepairs).toHaveLength(1);
  expect(repaired.familyMetadataRepairs![0].userId).toBe('migration:families-v1');
  await page.locator('#nav-tab-comptoir').click();
  await page.getByRole('button', { name: /^Réimprimer la facture mensuelle 2026-09 Clients Comptoir$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__monthlyPrints.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).__monthlyPrints[0])).not.toContain('Famille non renseignée');
  // Stale saves / reloads cannot undo the reorganization or add duplicate traces.
  await page.evaluate(async state => (await import('/src/browserDb.ts')).saveStateToBrowser(state), state);
  await login(page);
  expect((await read(page))!.monthlyInvoices![0]).toEqual(repaired);
});

test('échec de migration automatique : base originale conservée, aucun réensemencement, reprise possible', async ({ page }) => {
  await setup(page);
  const state = fixture();
  const original = createMonthlyInvoice(state, scope, []);
  original.documents.forEach(d => d.items.forEach(i => { delete i.actCode; }));
  state.monthlyInvoices = [original];
  await writeLegacyState(page, state);
  const result = await page.evaluate(async () => {
    const db = await import('/src/browserDb.ts');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (value?.state?.monthlyInvoices?.some((i: any) => i.familyMetadataRepairs?.length)) throw new DOMException('Disque plein', 'QuotaExceededError');
      return put.call(this, value, key);
    };
    try { return await db.loadStateFromBrowser(); }
    finally { IDBObjectStore.prototype.put = put; }
  });
  expect(result!.monthlyInvoices).toEqual([original]);
  expect(result!.invoices).toEqual(state.invoices);
  expect(result!.users).toEqual(state.users);
  const retried = await read(page);
  expect(retried!.monthlyInvoices![0].familyMetadataRepairs).toHaveLength(1);
  expect(retried!.monthlyInvoices![0].documents.flatMap(d => d.items.map(i => i.actCode))).toEqual(['CONS', 'CONS']);
});

test('réorganisation idempotente des références famille et des instantanés, sans modifier le reste de la base', () => {
  const state = fixture();
  state.articles = [{ id: 'article', name: 'Analyse', family: ' LAB ', unit: 'acte', priceComptoir: 10, priceSociete: 10, priceExterne: 10, purchasePrice: 0, stockCentral: 9, stockPharmacie: 2 }];
  const invoice = createMonthlyInvoice(state, scope, []);
  invoice.documents.forEach(d => d.items.forEach(i => { delete i.actCode; }));
  state.monthlyInvoices = [invoice];
  state.currentUser = null;
  const before = structuredClone(state);
  const migrated = reorganizeFamilyMetadata(state, '2026-09-10T12:00:00Z');
  expect(migrated.articles[0].family).toBe('LABO');
  expect(migrated.monthlyInvoices![0].familyMetadataRepairs).toHaveLength(1);
  expect(reorganizeFamilyMetadata(migrated)).toBe(migrated);
  const { articles, monthlyInvoices, ...rest } = migrated;
  const { articles: oldArticles, monthlyInvoices: oldInvoices, ...oldRest } = before;
  expect(rest).toEqual(oldRest);
  expect(state).toEqual(before);
  expect(articles[0]).toEqual({ ...oldArticles[0], family: 'LABO' });
});

test('deux onglets réorganisent une seule fois la base commune', async ({ page, context }) => {
  await setup(page);
  const state = fixture();
  const invoice = createMonthlyInvoice(state, scope, []);
  invoice.documents.forEach(d => d.items.forEach(i => { delete i.actCode; }));
  state.monthlyInvoices = [invoice];
  await writeLegacyState(page, state);
  const other = await context.newPage(); await emptyOrigin(other);
  const [a, b] = await Promise.all([read(page), read(other)]);
  expect(a!.monthlyInvoices).toEqual(b!.monthlyInvoices);
  expect(a!.monthlyInvoices![0].familyMetadataRepairs).toHaveLength(1);
});

test('audit du catalogue du dépôt : tous les articles et toutes les lignes retrouvent une famille', () => {
  const state = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  expect(state.articles.length).toBeGreaterThan(0);
  expect(auditArticleFamilies(state)).toEqual([]);
  expect(collectBillingDocuments(state).flatMap(d => d.items).filter(i => !i.actCode?.trim())).toEqual([]);
});
