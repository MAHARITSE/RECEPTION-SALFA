import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import type { BillingDocument } from '../src/modules/assurance/monthlyBilling';
import { mergedBillingPrintHtml, twoPerPagePrintHtml } from '../src/modules/assurance/printBilling';
import { factureCorrespondRecherche } from '../src/modules/assurance/utils/rechercheDocument';

const doc = (overrides: Partial<BillingDocument> = {}): BillingDocument => ({
  id: 'doc-1', sourceId: 'src-1', category: 'externe',
  number: '26FA0909001', date: '2026-09-09', client: 'Client Externe',
  total: 15000, copay: 0, payable: 15000, paid: 15000, rejected: 0,
  items: [
    { description: 'Amoxicilline 1g', quantity: 2, unitPrice: 2000, amount: 4000 },
    { description: 'Consultation', quantity: 1, unitPrice: 11000, amount: 11000 },
  ],
  ...overrides,
});
const docAout = (): BillingDocument => doc({
  id: 'doc-2', sourceId: 'src-2', number: '26FA0815007', date: '2026-08-15',
  total: 5000, payable: 5000, paid: 5000,
  items: [{ description: 'NFS (labo)', quantity: 1, unitPrice: 5000, amount: 5000 }],
});

test('recherche fiche : n°, date ISO/FR, article, montant, multi-mots', () => {
  const piece = doc();
  expect(factureCorrespondRecherche(piece, '26fa0909')).toBe(true);
  expect(factureCorrespondRecherche(piece, '2026-09-09')).toBe(true);
  expect(factureCorrespondRecherche(piece, '09/09/2026')).toBe(true);
  expect(factureCorrespondRecherche(piece, 'amoxicilline')).toBe(true);
  expect(factureCorrespondRecherche(piece, '11000')).toBe(true);
  expect(factureCorrespondRecherche(piece, 'amox 26fa0909')).toBe(true);
  expect(factureCorrespondRecherche(piece, 'jirama')).toBe(false);
  expect(factureCorrespondRecherche(piece, '')).toBe(true);
  expect(factureCorrespondRecherche(piece, '   ')).toBe(true);
});

test('fusion : une seule facture A4 paysage, numéro de la plus ancienne, sans lister les factures', () => {
  const state = { ticketSettings: { currency: 'Ar', facilityName: 'CENTRE TEST' }, currentUser: { id: 'u', name: 'Test' } } as unknown as AppState;
  const html = mergedBillingPrintHtml(state, [doc(), docAout()], 'RAKOTO Jeanne');
  // La facture fusionnée porte le numéro de la pièce la PLUS ANCIENNE (août).
  expect(html).toContain('FACTURE&nbsp; 26FA0815007');
  // Les factures d'origine ne sont PAS listées sur la facture imprimée.
  expect(html).not.toContain('26FA0909001');
  expect(html).not.toContain('Factures regroupées');
  expect(html).not.toContain('source-row');
  expect(html).toContain('RAKOTO Jeanne');
  expect(html).toContain('Amoxicilline 1g');
  expect(html).toContain('NFS (labo)');
  // A4 paysage, contenu à gauche puis suite à droite.
  expect(html).toContain('size:A4 landscape');
  expect(html).toContain('fusion-flow');
  expect(html).toContain('columns:2');
  expect(html).toContain('column-fill:auto');
  // Totaux cumulés des pièces d'origine : brut 20 000, net 20 000, encaissé 20 000.
  expect(html).toContain('Total Brut');
  expect(html).toContain('Net à payer');
  expect(html).toContain('Encaissé');
  expect(html).toContain('Arrêtée à la somme de');
  expect(html).toContain('sans nouvel encaissement ni nouvelle créance');
  expect(() => mergedBillingPrintHtml(state, [])).toThrow('Aucune facture sélectionnée pour la fusion.');
});

test('fusion : les articles des pièces sont mis à la suite, numérotés en continu', () => {
  const state = { ticketSettings: { currency: 'Ar' }, currentUser: { id: 'u', name: 'Test' } } as unknown as AppState;
  const html = mergedBillingPrintHtml(state, [doc(), docAout()]);
  // Ordre chronologique : la pièce d'août (NFS) ouvre la facture, celle de
  // septembre la suit — une seule liste d'articles, sans ligne de séparation.
  expect(html.indexOf('NFS (labo)')).toBeGreaterThan(-1);
  expect(html.indexOf('NFS (labo)')).toBeLessThan(html.indexOf('Amoxicilline 1g'));
  expect((html.match(/<tr><td class="number">/g) || []).length).toBe(3);
});

test('impression 2 par page : deux en-têtes séparés, un par facture, jamais un seul étendu', () => {
  const state = { ticketSettings: { currency: 'Ar', facilityName: 'CENTRE TEST' }, currentUser: { id: 'u', name: 'Test' } } as unknown as AppState;
  const html = twoPerPagePrintHtml(state, [doc(), docAout()]);
  expect(html).toContain('size:A4 landscape');
  expect(html).toContain('duo-page');
  expect((html.match(/class="individual duo-half"/g) || []).length).toBe(2);
  // Deux en-têtes séparés : chacun DANS sa moitié de feuille, avant le titre
  // de SA facture — et aucun en-tête au niveau du document entier.
  expect((html.match(/<div class="invoice-header"/g) || []).length).toBe(2);
  const moities = html.split('class="individual duo-half"').slice(1);
  expect(moities.length).toBe(2);
  for (const moitie of moities) {
    expect(moitie.indexOf('invoice-header')).toBeGreaterThanOrEqual(0);
    expect(moitie.indexOf('invoice-header')).toBeLessThan(moitie.indexOf('FACTURE&nbsp;'));
  }
  expect(html).toContain('26FA0909001');
  expect(html).toContain('26FA0815007');
  // Nombre impair : la seconde moitié de la dernière feuille reste vide,
  // sans en-tête fantôme.
  const impair = twoPerPagePrintHtml(state, [doc(), docAout(), doc({ id: 'doc-3', sourceId: 'src-3', number: '26FA0911003', date: '2026-09-11' })]);
  expect((impair.match(/<div class="invoice-header"/g) || []).length).toBe(3);
  expect(impair).toContain('aria-hidden="true"');
});

/* ===== Tests UI : recherche sans filtre + bouton Fusionner dans la fiche client ===== */

async function setup(page: Page) {
  const state = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(state)) if (Array.isArray(value)) (state as unknown as Record<string, unknown>)[key] = [];
  state.users = [{ id: 'billing-test', name: 'Facturation Test', role: 'billing', password: 'test123' }];
  state.currentUser = state.users[0];
  state.patients = [];
  const invoice = (id: string, numeroFacture: string, date: string, clientName: string, items: object[]): object => ({
    id, numeroFacture, clientName, clientType: 'externe', isExternal: true, createdAt: date,
    totalAmount: items.reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    patientCharge: items.reduce((s: number, i: { amount: number }) => s + i.amount, 0),
    status: 'paid', creditSociete: false, items,
  });
  state.invoices = [
    invoice('ext-sept', '26FA0910001', '2026-09-10T08:00:00Z', 'Client Externe', [{ category: 'consultation', description: 'Consultation', quantity: 1, unitPrice: 10000, amount: 10000 }]),
    invoice('ext-aout', '26FA0815001', '2026-08-15T08:00:00Z', 'Client Externe', [
      { category: 'pharmacy', description: 'Amoxicilline 1g', quantity: 2, unitPrice: 2000, amount: 4000 },
      { category: 'lab', description: 'NFS', quantity: 1, unitPrice: 5000, amount: 5000 },
    ]),
  ];
  state.ventes = [];
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

async function printsHtml(page: Page): Promise<string> {
  return page.evaluate(() => ((window as unknown as { __printsHtml?: string[] }).__printsHtml || []).join('\n'));
}

test('UI : la fiche liste toutes les dates sans filtre de mois, avec recherche locale', async ({ page }) => {
  await setup(page); await login(page);
  // Filtre mois septembre : la fiche d'août disparaît des dossiers…
  await page.getByLabel('Mois comptoir & externe').fill('2026-09');
  const dossiers = page.getByRole('table', { name: 'Dossiers clients comptoir & externes' });
  // …mais la fiche du client montre TOUTES ses factures, toutes dates confondues.
  await dossiers.getByRole('cell', { name: 'Client Externe' }).first().dblclick();
  const fiche = page.getByRole('dialog', { name: 'Factures de Client Externe' });
  await expect(fiche).toBeVisible();
  await expect(fiche).toContainText('2 facture(s) — toutes les dates');
  await expect(fiche).toContainText('26FA0910001');
  await expect(fiche).toContainText('26FA0815001');

  // Recherche locale : par article, par date, par montant.
  const recherche = fiche.getByLabel('Rechercher une facture du client');
  await recherche.fill('amoxicilline');
  await expect(fiche).toContainText('26FA0815001');
  await expect(fiche).not.toContainText('26FA0910001');
  await expect(fiche).toContainText('1 affichée(s)');
  await recherche.fill('10/09/2026');
  await expect(fiche).toContainText('26FA0910001');
  await expect(fiche).not.toContainText('26FA0815001');
  await fiche.getByRole('button', { name: 'Effacer la recherche de facture' }).click();
  await expect(fiche).toContainText('26FA0910001');
  await expect(fiche).toContainText('26FA0815001');
  await fiche.getByRole('button', { name: 'Fermer' }).click();
});

test('UI : fusion des factures cochées en une seule facture A4 paysage', async ({ page }) => {
  await setup(page); await login(page);
  const dossiers = page.getByRole('table', { name: 'Dossiers clients comptoir & externes' });
  await dossiers.getByRole('cell', { name: 'Client Externe' }).first().dblclick();
  const fiche = page.getByRole('dialog', { name: 'Factures de Client Externe' });
  await expect(fiche).toBeVisible();

  // Sans sélection, le bouton est désactivé.
  await expect(fiche.getByRole('button', { name: /Fusionner en une seule facture/ })).toBeDisabled();
  await fiche.getByRole('checkbox', { name: 'Tout sélectionner' }).check();
  const fusionner = fiche.getByRole('button', { name: /Fusionner en une seule facture \(2\)/ });
  await expect(fusionner).toBeEnabled();

  // Client sans nom propre : le nom est demandé avant l'impression fusionnée.
  await fusionner.click();
  const modal = page.getByRole('dialog', { name: 'Nom du client pour la facture' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Fusion de 2 facture(s)');
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
  await modal.getByLabel('Nom à mettre sur la facture').fill('RAKOTO Jeanne');
  await modal.getByRole('button', { name: /Imprimer la facture/ }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(1);

  // Une seule facture imprimée, A4 paysage : elle porte le numéro de la plus
  // ancienne (août) et ne liste pas les factures d'origine.
  await expect.poll(() => printsHtml(page)).toContain('26FA0815001');
  const html = await printsHtml(page);
  expect(html).toContain('RAKOTO Jeanne');
  expect(html).toContain('Amoxicilline 1g');
  expect(html).not.toContain('26FA0910001');
  expect(html).not.toContain('FUSIONNÉE');
  expect(html).toContain('size:A4 landscape');
  expect(html).toContain('fusion-flow');
  // La fiche reste ouverte et la base est inchangée : aucune facture créée ni modifiée.
  await expect(fiche).toBeVisible();
  const apres = await page.evaluate(async () => (await import('/src/browserDb.ts')).loadStateFromBrowser());
  expect(apres?.invoices).toHaveLength(2);
  expect(apres?.monthlyInvoices ?? []).toHaveLength(0);
  expect(apres?.invoices.every(i => i.clientName === 'Client Externe')).toBe(true);
});
