import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, role: 'billing' | 'admin' = 'billing') {
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption(role === 'admin' ? 'USR-ADMIN' : 'USR-BIL');
  await page.getByLabel('Mot de passe', { exact: true }).fill(role === 'admin' ? 'admin123' : 'fact123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const { loadStateFromBrowser } = await import('/src/browserDb.ts');
    return loadStateFromBrowser();
  });
}

test('le suivi ouvre directement les filtres et les dix vues sans les anciens bandeaux', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await login(page);
  await expect(page.locator('.assurance-module')).toBeVisible();
  await expect(page.getByText('Facturation Sociétés', { exact: true })).toHaveCount(0);
  await expect(page.locator('.assurance-module > :first-child')).toHaveAttribute('id', 'advanced-filter-banner');
  for (const text of ['Suivi assurance — Prestations, règlements & rejets', 'Connecté:', 'Suivi Assurance SALFA', 'Hôpitaly Loterana Toliary Tanambao', 'Module Réception SALFA', 'Base commune Réception SALFA', 'Historique commun ·']) {
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  }
  for (const name of ['Consulter les archives', 'Exporter l’historique (JSON)', 'Télécharger la sauvegarde commune JSON']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  for (const id of ['prestations', 'paiements', 'rejets', 'historique', 'societes', 'personnes', 'familles', 'etats', 'entete', 'dashboard']) {
    await page.locator(`#nav-tab-${id}`).click();
    await expect(page.locator(`#nav-tab-${id}`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Une erreur est survenue', { exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('une société et un assuré persistent sans modifier les anciennes factures', async ({ page, context }) => {
  await page.goto('/');
  await login(page);
  const before = await storedState(page);
  await page.locator('#nav-tab-societes').click();
  await page.getByRole('button', { name: "Nouvelle Société d'Assurance" }).click();
  await page.getByPlaceholder('Ex: Sanlam Santé').fill('Assurance test');
  await page.getByPlaceholder('Ex: SNL-01').fill('TEST');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('#societes-view').getByRole('heading', { name: 'ASSURANCE TEST' })).toBeVisible();
  await page.locator('#nav-tab-personnes').click();
  await page.getByRole('button', { name: 'Nouvel Adhérent / Assuré' }).click();
  const patient = before!.patients.find(p => p.clientType !== 'societe')!;
  await page.getByLabel('Patient de la Réception', { exact: true }).selectOption(patient.id);
  await page.locator('#personnes-view form select').filter({ has: page.locator('option', { hasText: 'ASSURANCE TEST' }) }).selectOption({ label: 'ASSURANCE TEST' });
  await page.getByPlaceholder('MAT-0001').fill('MAT-TEST');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect.poll(async () => (await storedState(page))?.patients.find(p => p.id === patient.id)?.company).toBe('ASSURANCE TEST');
  const patientName = `${patient.lastName} ${patient.firstName}`.trim();
  await page.locator('#nav-tab-prestations').click();
  await page.locator('#select-filter-societe').selectOption({ label: 'ASSURANCE TEST (TEST)' });
  await page.getByRole('tab', { name: /Vue Détaillée/ }).click();
  await page.getByRole('button', { name: 'Nouvelle prestation', exact: true }).click();
  await page.getByPlaceholder('Ex: FACT-2025-001').fill('TEST-FAC-001');
  await page.getByPlaceholder('Montant', { exact: true }).fill('10000');
  await page.getByRole('button', { name: 'Créer la Prestation', exact: true }).click();
  await expect.poll(async () => (await storedState(page))?.assurancePrestations?.length).toBe(1);

  await page.reload();
  await login(page);
  await page.locator('#nav-tab-personnes').click();
  await expect(page.getByRole('cell', { name: patientName, exact: true })).toBeVisible();
  const after = await storedState(page);
  expect(after?.invoices).toEqual(before?.invoices);
  expect(after?.companyBillingAccounts).toEqual(before?.companyBillingAccounts);
  expect(after?.companies.some(s => s.name === 'ASSURANCE TEST')).toBe(true);
  expect(after?.patients).toHaveLength(before!.patients.length);
  expect(after?.assuranceFamilles?.length).toBeGreaterThan(0);
  const prestation = after?.assurancePrestations?.[0];
  expect(prestation?.numeroFacture).toBe('TEST-FAC-001');
  expect(prestation?.totalPrestation).toBe(10000);
  expect(prestation?.lignes[0].prestationId).toBe(prestation?.id);

  const other = await context.newPage();
  await other.goto('/');
  await login(other);
  await other.locator('#nav-tab-personnes').click();
  await expect(other.getByRole('cell', { name: patientName, exact: true })).toBeVisible();
});

test('accès administrateur au suivi et Caisse toujours disponible', async ({ page }) => {
  await page.goto('/');
  await login(page, 'admin');
  await page.getByRole('button', { name: /Suivi assurance/ }).click();
  await expect(page.locator('.assurance-module')).toBeVisible();
  await page.locator('header select').selectOption('cashier');
  await expect(page.locator('.assurance-module')).toHaveCount(0);
  await expect(page.getByText('Connecté:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Clôture/ }).first()).toBeVisible();
});

test('la sauvegarde complète reste disponible dans Administration après retrait du bandeau', async ({ page }) => {
  await page.goto('/');
  await login(page, 'admin');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter Base (JSON)', exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(download.suggestedFilename()).toMatch(/^HIS-salfa-backup-.*\.json$/);
  expect(backup.state.currentUser).toBeNull();
  expect(backup.state.patients.length).toBeGreaterThan(0);
  expect(backup.state.invoices.length).toBeGreaterThan(0);
  expect(backup.state.assurancePaiements).toBeDefined();
});
