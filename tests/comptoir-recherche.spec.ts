import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BillingDocument } from '../src/modules/assurance/monthlyBilling';
import { documentCorrespondRecherche, nomClientGenerique } from '../src/modules/assurance/utils/rechercheDocument';

const doc = (overrides: Partial<BillingDocument> = {}): BillingDocument => ({
  id: 'doc-1', sourceId: 'src-1', category: 'comptoir',
  number: '26FA0909001', date: '2026-09-09', client: 'RAKOTO Jean', dossier: 'DOS-0042', matricule: 'MAT-7',
  total: 5000, copay: 0, payable: 5000, paid: 5000, rejected: 0,
  items: [{ description: 'Consultation', amount: 5000 }],
  ...overrides,
});

test('recherche : numéro de facture, nom, dossier ou matricule, insensible à la casse et aux accents', () => {
  const piece = doc();
  expect(documentCorrespondRecherche(piece, '26FA0909001')).toBe(true);
  expect(documentCorrespondRecherche(piece, '26fa09')).toBe(true);      // casse
  expect(documentCorrespondRecherche(piece, 'rakoto')).toBe(true);       // nom
  expect(documentCorrespondRecherche(piece, 'Râkôto J')).toBe(true);     // accents + partiel
  expect(documentCorrespondRecherche(piece, 'DOS-0042')).toBe(true);     // dossier
  expect(documentCorrespondRecherche(piece, 'mat-7')).toBe(true);        // matricule
  expect(documentCorrespondRecherche(piece, 'RAKOTO Jeanne')).toBe(false); // pas de correspondance complète
  expect(documentCorrespondRecherche(piece, 'JIRAMA')).toBe(false);
  // Requête vide ou espaces : tout correspond (aucun filtrage).
  expect(documentCorrespondRecherche(piece, '')).toBe(true);
  expect(documentCorrespondRecherche(piece, '   ')).toBe(true);
});

test('recherche : accent dans le nom du client normalisé des deux côtés', () => {
  const piece = doc({ client: 'RASOANAIVO Rasoa' });
  expect(documentCorrespondRecherche(piece, 'rasoanaivo')).toBe(true);
  expect(documentCorrespondRecherche(piece, 'Râsoânâivô')).toBe(true);
});

test('nom générique : Client Externe / Clients Comptoir réclament un nom, un nom propre non', () => {
  expect(nomClientGenerique('Client Externe')).toBe(true);
  expect(nomClientGenerique('Clients Externes')).toBe(true);
  expect(nomClientGenerique('client externe')).toBe(true);
  expect(nomClientGenerique('Clients Comptoir')).toBe(true);
  expect(nomClientGenerique('Externes')).toBe(true);   // libellé nu
  expect(nomClientGenerique('Comptoir')).toBe(true);   // libellé nu
  expect(nomClientGenerique('')).toBe(true);
  expect(nomClientGenerique(undefined)).toBe(true);
  expect(nomClientGenerique('RAKOTO Jean')).toBe(false);
  expect(nomClientGenerique('Société X')).toBe(false);
});

/* ===== Test UI : champ de recherche dans l'onglet Comptoir & Externe ===== */

async function setup(page: Page) {
  const state = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8'));
  const patient = state.patients[0];
  for (const [key, value] of Object.entries(state)) if (Array.isArray(value)) (state as unknown as Record<string, unknown>)[key] = [];
  state.users = [{ id: 'billing-test', name: 'Facturation Test', role: 'billing', password: 'test123' }];
  state.currentUser = state.users[0];
  state.companies = [{ id: 'soc-A', name: 'SOCIETE A', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance' }];
  state.patients = [{ ...patient, id: 'patient-A', company: 'SOCIETE A', clientType: 'societe', lastName: 'RAKOTO', firstName: 'TEST' }];
  const invoice = (id: string, clientType: 'comptoir' | 'societe' | 'externe', date = '2026-09-10T08:00:00Z'): object => ({ id, clientType, patientId: 'patient-A', createdAt: date, isExternal: clientType === 'externe', totalAmount: 10000, patientCharge: 10000, status: 'paid', creditSociete: clientType === 'societe', items: [{ category: 'consultation', description: 'Consultation', amount: 10000 }] });
  state.invoices = [invoice('comptoir-1', 'comptoir'), invoice('comptoir-2', 'comptoir'), invoice('external', 'externe'), invoice('soc-A', 'societe'), invoice('old-counter', 'comptoir', '2026-08-10T08:00:00Z')];
  const sale = (id: string, clientType: 'comptoir' | 'externe' = 'comptoir'): object => ({ id, numeroFacture: `FAC-${id}`, clientType, type: 'consultation', subtotal: 4000, montantFacture: 4000, montantPaye: 1000, status: 'partiel', isExterne: clientType === 'externe', source: 'caisse', dateVente: '2026-09-12', createdAt: '2026-09-12' });
  state.ventes = [{ ...sale('mirror'), legacyInvoiceId: 'comptoir-1' }, sale('standalone', 'externe')];
  state.monthlyInvoices = [];
  await page.addInitScript(() => {
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'));
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 10);
    };
  });
  await page.route('**/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Tests</body></html>' }));
  await page.goto('/'); await page.unroute('**/');
  await page.evaluate(async s => { const db = await import('/src/browserDb.ts'); await db.saveStateToBrowser(s); }, state);
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
  await page.locator('#nav-tab-comptoir').click();
}

test('UI : la recherche filtre les deux vues par nom ou numéro de facture', async ({ page }) => {
  await setup(page); await login(page);
  // Vue Détaillée : un dossier par nom de client (RAKOTO TEST + libellé « Externes »).
  const compteurDossiers = page.getByRole('tab', { name: /Vue Détaillée/ });
  await expect(compteurDossiers).toContainText('2');
  const recherche = page.getByLabel('Rechercher un nom ou un numéro de facture');

  // Par numéro de facture, insensible à la casse : un seul dossier.
  await recherche.fill('fac-mirror');
  await expect(compteurDossiers).toContainText('1');
  await page.getByRole('tab', { name: /Vue Détaillée/ }).click();
  const dossiers = page.getByRole('table', { name: 'Dossiers clients comptoir & externes' });
  await expect(dossiers).toContainText('RAKOTO TEST');
  await expect(dossiers).not.toContainText('Externes');

  // Le dossier du client liste toutes ses factures, avec leur date.
  await dossiers.getByRole('cell', { name: 'RAKOTO TEST' }).first().dblclick();
  const fiche = page.getByRole('dialog', { name: 'Factures de RAKOTO TEST' });
  await expect(fiche).toBeVisible();
  await expect(fiche).toContainText('FAC-mirror');
  await expect(fiche).not.toContainText('comptoir-2'); // la recherche filtre aussi la fiche

  // Vue par Facture : seuls les regroupements contenant une pièce correspondante restent.
  await fiche.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('tab', { name: /Vue par Facture/ }).click();
  const mensuelles = page.getByRole('table', { name: 'Factures mensuelles comptoir & externes' });
  await expect(mensuelles.locator('tbody tr')).toHaveCount(3);
  await recherche.fill('fac-mirror');
  await expect(mensuelles.locator('tbody tr')).toHaveCount(1);

  // Effacer rétablit la liste complète.
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  await expect(mensuelles.locator('tbody tr')).toHaveCount(3);
  await expect(compteurDossiers).toContainText('2');
});

test("UI : le nom du client est demandé dans le dossier, à l'impression d'une facture sans nom propre", async ({ page }) => {
  await setup(page); await login(page);
  await page.getByRole('tab', { name: /Vue Détaillée/ }).click();
  const dossiers = page.getByRole('table', { name: 'Dossiers clients comptoir & externes' });

  // Dossier « Externes » (sans nom propre) : impression → demande du nom.
  await dossiers.getByRole('cell', { name: 'Externes' }).dblclick();
  const fiche = page.getByRole('dialog', { name: 'Factures de Externes' });
  await expect(fiche).toBeVisible();
  await fiche.getByRole('button', { name: 'Imprimer la facture FAC-standalone', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Nom du client pour la facture' });
  await expect(modal).toBeVisible();
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
  await modal.getByLabel('Nom à mettre sur la facture').fill('RAKOTO Jeanne');
  await modal.getByRole('button', { name: /Imprimer la facture/ }).click();
  await expect(modal).toHaveCount(0);
  // Le nom est enregistré sur la pièce et le dossier se referme (la pièce change de nom).
  await expect(fiche).toHaveCount(0);
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(1);
  await expect.poll(async () => (await read(page))?.ventes.find(v => v.id === 'standalone')?.clientName).toBe('RAKOTO Jeanne');

  // Dossier avec nom propre : la facture s'imprime directement depuis la fiche.
  await dossiers.getByRole('cell', { name: 'RAKOTO TEST' }).dblclick();
  const ficheRakoto = page.getByRole('dialog', { name: 'Factures de RAKOTO TEST' });
  await expect(ficheRakoto).toBeVisible();
  await ficheRakoto.getByRole('button', { name: 'Imprimer la facture FAC-mirror', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nom du client pour la facture' })).toHaveCount(0);
  await expect(ficheRakoto).toBeVisible(); // la fiche reste ouverte pour imprimer d'autres factures
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(2);
});
