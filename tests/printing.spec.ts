import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getExamReceipts } from '../src/utils/examReceipts';
import type { AppState } from '../src/store';
import type { Consultation, EchoRequest, Invoice, LabRequest, Patient, TicketSettings } from '../src/types';

const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
const patient: Patient = {
  ...seed.patients[0], id: 'test-patient', dossier: 'TST9001', firstName: 'TEST', lastName: 'IMPRESSION',
  company: undefined, clientType: 'comptoir', status: 'consulted_awaiting_payment',
};
const lab: LabRequest = {
  id: 'test-lab', examType: 'Numération sanguine', parameters: ['Hémoglobine'], urgent: true,
  status: 'pending', requestedBy: 'test-doctor', code: 'NFS',
};
const echo: EchoRequest = {
  id: 'test-echo', examType: 'Échographie abdominale', urgent: false, status: 'pending',
  notes: 'À jeun & vessie pleine', requestedBy: 'test-doctor',
};
const consultation: Consultation = {
  id: 'test-consultation', patientId: patient.id, doctorId: 'test-doctor', doctorName: 'Médecin Test',
  date: new Date().toISOString(), visitReason: 'Examens', diagnosis: 'Bilan', notes: '',
  vitalSigns: { temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' },
  prescriptions: [], labRequests: [lab], echoRequests: [echo],
  hospitalizeRequested: false, surgeryRequested: false, isEmergency: false,
};
const invoice = (id: string, category: 'lab' | 'echo'): Invoice => ({
  id, patientId: patient.id, consultationId: consultation.id, clientType: 'comptoir',
  items: [{ category, description: category === 'lab' ? lab.examType : echo.examType, amount: category === 'lab' ? 10000 : 30000 }],
  totalAmount: category === 'lab' ? 10000 : 30000, patientCharge: category === 'lab' ? 10000 : 30000,
  status: 'pending', createdAt: new Date().toISOString(), isExternal: false,
});
const invoices = [invoice('test-invoice-lab', 'lab'), invoice('test-invoice-echo', 'echo')];
const settings: TicketSettings = { ...seed.ticketSettings, showLogo: false, logoUrl: '', copies: 1 };

interface PrintAttempt { title: string; text: string; color: string; background: string; frames: number; width: number; }
declare global {
  interface Window {
    __printAttempts: PrintAttempt[];
    __printMode: 'hold' | 'throw' | 'blocked';
    __activePrints: number;
    __overlappingPrints: number;
    __printErrors: string[];
  }
}

async function installPrintMock(page: Page) {
  await page.addInitScript(() => {
    if (window === window.parent) {
      window.__printAttempts = [];
      window.__printMode = 'hold';
      window.__activePrints = 0;
      window.__overlappingPrints = 0;
      window.__printErrors = [];
      window.addEventListener('salfa:print-error', (event) => {
        window.__printErrors.push((event as CustomEvent<{ title: string }>).detail.title);
      });
    }
    // Simule une boîte native non bloquante qui reste ouverte jusqu'à afterprint.
    // Aucune imprimante physique ni donnée d'un utilisateur réel n'est utilisée.
    window.print = () => {
      const host = window.parent;
      if (host.__printMode === 'throw') throw new Error('Impression refusée');
      if (host.__printMode === 'blocked') return;
      if (host.__activePrints) host.__overlappingPrints++;
      host.__activePrints++;
      window.addEventListener('afterprint', () => { host.__activePrints--; }, { once: true });
      window.dispatchEvent(new Event('beforeprint'));
      host.__printAttempts.push({
        title: document.title, text: document.body.innerText,
        color: getComputedStyle(document.body).color,
        background: getComputedStyle(document.body).backgroundColor,
        frames: host.document.querySelectorAll('iframe[data-salfa-print]').length,
        width: window.innerWidth,
      });
    };
  });
}

async function emptyOrigin(page: Page) {
  await page.route('**/', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body>Test impression</body></html>' }));
  await page.goto('/');
  await page.unroute('**/');
}

async function expectJobs(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.__printAttempts.length)).toBe(count);
  expect(await page.evaluate(() => window.__overlappingPrints)).toBe(0);
}

async function closePrint(page: Page) {
  await page.locator('iframe[data-salfa-print]').evaluate((element) => {
    (element as HTMLIFrameElement).contentWindow!.dispatchEvent(new Event('afterprint'));
  });
}

async function browserState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('reception-salfa', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<AppState>((resolve, reject) => {
      const request = db.transaction('application').objectStore('application').get('state');
      request.onsuccess = () => { resolve(request.result.state); db.close(); };
      request.onerror = () => reject(request.error);
    });
  });
}

function fixtureState(paid = false): AppState {
  const state = structuredClone(seed);
  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value)) (state as unknown as Record<string, unknown>)[key] = [];
  }
  state.currentUser = null;
  state.ticketSettings = settings;
  state.users = [
    { id: 'test-cashier', name: 'Caisse Test', role: 'cashier', password: 'test123' },
    { id: 'test-doctor', name: 'Médecin Test', role: 'doctor' },
  ];
  state.patients = [{ ...patient, status: paid ? 'invoice_paid' : 'consulted_awaiting_payment' }];
  // Examens uniquement dans la consultation, sans invoiceId et sans ordonnance.
  // Inclure une ancienne échographie NON facturée, qui ne doit jamais sortir.
  state.consultations = [structuredClone(consultation), {
    ...structuredClone(consultation), id: 'old-consultation', labRequests: [],
    echoRequests: [{ ...echo, id: 'old-echo', examType: 'Ancien examen non facturé', notes: 'NE PAS IMPRIMER' }],
  }];
  const paidAt = new Date().toISOString();
  state.invoices = invoices.map((inv) => ({ ...structuredClone(inv),
    ...(paid ? { status: 'paid' as const, paidAt, paidBy: 'test-cashier' } : {}),
  }));
  return state;
}

async function openCashier(page: Page, state = fixtureState()) {
  await installPrintMock(page);
  await emptyOrigin(page);
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('reception-salfa', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('application');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('application', 'readwrite');
      transaction.objectStore('application').put({ state: fixture, savedAt: Date.now() }, 'state');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  }, state);
  await page.goto('/');
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption('test-cashier');
  await page.getByLabel('Mot de passe', { exact: true }).fill('test123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText("File d'attente de paiement", { exact: true })).toBeVisible();
}

test('les bons legacy viennent des factures même si les demandes sont terminées ou absentes', () => {
  const completed = { ...consultation, labRequests: [{ ...lab, status: 'completed' as const }], echoRequests: [] };
  const result = getExamReceipts(invoices, [completed], []);
  expect(result.labLines.map((line) => line.examType)).toEqual([lab.examType]);
  expect(result.echoLines.map((line) => line.examType)).toEqual([echo.examType]);
  expect(result.pendingLabIds.size).toBe(0);
  expect(result.pendingEchoIds.size).toBe(0);
});

test('la collecte déduplique les demandes et exclut les autres factures / consultations', () => {
  const result = getExamReceipts(invoices, [consultation, {
    ...consultation, id: 'other-consultation', labRequests: [],
    echoRequests: [{ ...echo, id: 'not-billed', notes: 'Ne pas imprimer' }],
  }], [{ ...lab, patientId: patient.id, consultationId: consultation.id }]);
  expect(result.labLines).toHaveLength(1);
  expect(result.echoLines).toHaveLength(1);
  expect(result.echoLines[0].notes).toBe(echo.notes);
  expect([...result.pendingLabIds]).toEqual([lab.id]);
  expect([...result.pendingEchoIds]).toEqual([echo.id]);
  const anotherInvoice = { ...consultation, echoRequests: [{ ...echo, invoiceId: 'other-invoice', notes: 'Ne pas imprimer' }] };
  expect(getExamReceipts(invoices, [anotherInvoice], []).echoLines[0].notes).toBeUndefined();
});

test('un examen en cours ne régresse pas si une copie legacy est encore pending', () => {
  const result = getExamReceipts(invoices, [consultation], [{ ...lab, patientId: patient.id, consultationId: consultation.id, status: 'in_progress' }]);
  expect(result.labLines).toHaveLength(1);
  expect(result.pendingLabIds.size).toBe(0);
});

test('les reçus de ventes externes conservent quantité, urgence et tarif facturé', () => {
  const external: Invoice = { ...invoices[0], id: 'external', patientId: undefined, consultationId: undefined, isExternal: true, items: [
    { description: 'Groupe sanguin & Rhésus (URGENT) × 2', amount: 24000, category: 'lab' },
    { description: 'Échographie abdominale', quantity: 2, unitPrice: 35000, amount: 70000, category: 'echo' },
  ] };
  const result = getExamReceipts([external], [], []);
  expect(result.labLines[0]).toMatchObject({ examType: 'Groupe sanguin & Rhésus', urgent: true, quantity: 2, price: 12000 });
  expect(result.echoLines[0]).toMatchObject({ quantity: 2, price: 35000 });
});

test('les suffixes de quantité ne tronquent pas les noms d’examens', () => {
  const result = getExamReceipts([{ ...invoices[0], items: [
    { category: 'lab', description: 'Latex 2', amount: 10000 },
    { category: 'lab', description: 'Bilan x 2 (URGENT)', amount: 30000 },
  ] }], [], []);
  expect(result.labLines[0]).toMatchObject({ examType: 'Latex 2', quantity: 1 });
  expect(result.labLines[1]).toMatchObject({ examType: 'Bilan', quantity: 2, urgent: true });
});

test('le reçu, le laboratoire et l’écho attendent chacun la fermeture de l’impression précédente', async ({ page }) => {
  await openCashier(page);
  await page.getByTitle('Ouvrir la facture en fenêtre modale').click();
  await page.getByRole('button', { name: 'Encaisser 40 000,00 Ar', exact: true }).click();
  await expectJobs(page, 1);
  // Plus longtemps que les anciennes temporisations de 900 / 1800 ms.
  await page.waitForTimeout(2000);
  await expectJobs(page, 1);
  await closePrint(page);
  await expectJobs(page, 2);
  await closePrint(page);
  await expectJobs(page, 3);
  const attempts = await page.evaluate(() => window.__printAttempts);
  expect(attempts.map((attempt) => attempt.title)).toEqual([settings.receiptTitle, "BON D'ANALYSE — LABORATOIRE", "BON D'ÉCHOGRAPHIE"]);
  expect(attempts[1].text).toContain(lab.examType);
  expect(attempts[2].text).toContain(echo.notes);
  expect(attempts[2].text).not.toContain('NE PAS IMPRIMER');
  for (const attempt of attempts) {
    expect(attempt.color).toBe('rgb(0, 0, 0)');
    expect(attempt.background).toBe('rgb(255, 255, 255)');
    expect(attempt.frames).toBe(1);
    expect(attempt.width).toBeGreaterThan(0);
  }
  await closePrint(page);
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
  const paid = await browserState(page);
  expect(paid.invoices.every((inv) => inv.status === 'paid')).toBe(true);
  expect(paid.consultations.find((c) => c.id === consultation.id)?.labRequests[0].status).toBe('paid');
  expect(paid.consultations.find((c) => c.id === 'old-consultation')?.echoRequests?.[0].status).toBe('pending');

  const savedPayments = JSON.stringify(paid.invoices);
  await page.getByRole('region', { name: 'Dernier encaissement' }).getByRole('button', { name: 'Bon laboratoire', exact: true }).click();
  await expectJobs(page, 4);
  expect(JSON.stringify((await browserState(page)).invoices)).toBe(savedPayments);
  await closePrint(page);
});

test('les bons déjà encaissés se réimpriment depuis la clôture, sans recréer le paiement', async ({ page }) => {
  await openCashier(page, fixtureState(true));
  await page.getByRole('button', { name: /Clôture/, exact: false }).first().click();
  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Reçus / Bons / Facture A5', exact: true }) });
  const before = await browserState(page);
  await table.getByRole('button', { name: 'Bon laboratoire', exact: true }).click();
  await expectJobs(page, 1);
  await closePrint(page);
  await table.getByRole('button', { name: 'Bon échographie', exact: true }).click();
  await expectJobs(page, 2);
  expect((await browserState(page)).invoices).toEqual(before.invoices);
  await closePrint(page);
});

test('les ventes externes distinctes d’une même minute ne mélangent pas leurs duplicatas', async ({ page }) => {
  const state = fixtureState(true);
  state.consultations = [];
  state.invoices = state.invoices.map((inv, index) => ({ ...inv, patientId: undefined, consultationId: undefined, isExternal: true, clientType: 'externe', clientName: 'Client Externe', paidAt: index ? inv.paidAt!.replace(/\d{2}\.\d{3}Z$/, '30.000Z') : inv.paidAt }));
  await openCashier(page, state);
  await page.getByRole('button', { name: /Clôture/, exact: false }).first().click();
  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Reçus / Bons / Facture A5', exact: true }) });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table.getByRole('button', { name: 'Bon laboratoire', exact: true }).click();
  await expectJobs(page, 1);
  expect(await page.evaluate(() => window.__printAttempts[0].text)).not.toContain(echo.examType);
  await closePrint(page);
});

test('les exemplaires sont séquentiels, même sans prescripteur ni âge renseigné', async ({ page }) => {
  await installPrintMock(page);
  await emptyOrigin(page);
  await page.evaluate(async ({ config, pat, labs, echoes }) => {
    // @ts-expect-error Module source servi par Vite dans le navigateur.
    const tickets = await import('/src/utils/printTicket.ts');
    tickets.printLabRequestTicket({ ...config, copies: 2, paperWidth: 58 }, { ...pat, age: undefined }, undefined, new Date(), labs);
    tickets.printEchoRequestTicket({ ...config, copies: 1, paperWidth: 80 }, { ...pat, age: 42 }, undefined, new Date(), echoes);
  }, { config: settings, pat: patient, labs: [lab], echoes: [echo] });
  await expectJobs(page, 1);
  expect(await page.evaluate(() => window.__printAttempts[0].text)).toContain('Non renseigné');
  await closePrint(page);
  await expectJobs(page, 2);
  await closePrint(page);
  await expectJobs(page, 3);
  expect(await page.evaluate(() => window.__printAttempts[2].text)).toContain('42');
  await closePrint(page);
});

test('une boîte d’impression ouverte plus de 45 secondes ne perd pas son document', async ({ page }) => {
  await installPrintMock(page);
  await emptyOrigin(page);
  await page.clock.install();
  await page.evaluate(async () => {
    // @ts-expect-error Module source servi par Vite dans le navigateur.
    const { printDocument } = await import('/src/utils/printDocument.ts');
    printDocument('<!doctype html><html><head><title>Longue impression</title></head><body><h1>Document conservé</h1></body></html>', 'Longue impression');
  });
  await expectJobs(page, 1);
  await page.clock.fastForward(60000);
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(1);
  await closePrint(page);
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
});

test('une impression refusée avertit l’utilisateur et libère la file pour réessayer', async ({ page }) => {
  await installPrintMock(page);
  await emptyOrigin(page);
  await page.evaluate(async () => {
    window.__printMode = 'throw';
    // @ts-expect-error Module source servi par Vite dans le navigateur.
    const { printDocument } = await import('/src/utils/printDocument.ts');
    printDocument('<!doctype html><html><head><title>Refus</title></head><body><h1>Bon laboratoire</h1></body></html>', 'Bon laboratoire');
  });
  await expect.poll(() => page.evaluate(() => window.__printErrors)).toEqual(['Bon laboratoire']);
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
  await page.evaluate(async () => {
    window.__printMode = 'hold';
    // @ts-expect-error Module source servi par Vite dans le navigateur.
    const { printDocument } = await import('/src/utils/printDocument.ts');
    printDocument('<!doctype html><html><head><title>Nouvel essai</title></head><body><h1>Bon laboratoire</h1></body></html>', 'Bon laboratoire');
  });
  await expectJobs(page, 1);
  await closePrint(page);
});

test('une copie legacy ne fait pas perdre le lien facture présent dans la table globale', () => {
  const standaloneInvoice = { ...invoices[0], consultationId: undefined };
  const result = getExamReceipts([standaloneInvoice], [consultation], [
    { ...lab, invoiceId: standaloneInvoice.id, patientId: patient.id },
  ]);
  expect([...result.pendingLabIds]).toEqual([lab.id]);
  expect(result.labLines[0].urgent).toBe(true);
});

for (const scenario of ['lab', 'echo', 'completed-lab'] as const) {
  test(`un paiement ${scenario} seul produit son bon et conserve l’avancement médical`, async ({ page }) => {
    const state = fixtureState();
    const category = scenario === 'echo' ? 'echo' : 'lab';
    state.invoices = state.invoices.filter((inv) => inv.items[0].category === category);
    if (scenario === 'completed-lab') {
      state.consultations[0].labRequests[0].status = 'completed';
      state.labRequests = [{ ...lab, patientId: patient.id, consultationId: consultation.id }];
    }
    await openCashier(page, state);
    await page.getByTitle('Ouvrir la facture en fenêtre modale').click();
    const amount = state.invoices[0].patientCharge.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await page.getByRole('button', { name: `Encaisser ${amount} Ar`, exact: true }).click();
    await expectJobs(page, 1);
    await closePrint(page);
    await expectJobs(page, 2);
    expect(await page.evaluate(() => window.__printAttempts[1].title)).toBe(category === 'lab' ? "BON D'ANALYSE — LABORATOIRE" : "BON D'ÉCHOGRAPHIE");
    await closePrint(page);
    await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
    await expect.poll(async () => (await browserState(page)).invoices[0].status).toBe('paid');
    const saved = await browserState(page);
    const clinicalRequest = category === 'lab' ? saved.consultations[0].labRequests[0] : saved.consultations[0].echoRequests![0];
    expect(clinicalRequest.status).toBe(scenario === 'completed-lab' ? 'completed' : 'paid');
    expect(saved.invoices[0].patientCharge).toBe(state.invoices[0].patientCharge);
  });
}

test('une nouvelle vente externe imprime les deux bons et ne décompte pas de stock pour les actes', async ({ page }) => {
  const state = fixtureState();
  state.patients = [];
  state.consultations = [];
  state.invoices = [];
  const labArticle = structuredClone(seed.articles.find((article) => article.family === 'LABO' && article.unit === 'analyse')!);
  const echoArticle = structuredClone(seed.articles.find((article) => article.family === 'ECHO' && article.unit === 'acte')!);
  state.articles = [labArticle, echoArticle];
  await openCashier(page, state);
  const search = page.getByPlaceholder('🔍 Tapez...', { exact: true });
  for (const article of [labArticle, echoArticle]) {
    await search.fill(article.name);
    await search.press('Enter');
    if (article.id === labArticle.id) await page.getByRole('spinbutton').first().fill('2');
    await page.getByRole('button', { name: 'Enreg.', exact: true }).click();
  }
  const total = 2 * labArticle.priceExterne + echoArticle.priceExterne;
  // Prescripteur (facultatif) : champ de saisie assistée lié à la base des médecins.
  const medecinBase = seed.users.find((u: { role: string }) => u.role === 'doctor');
  const champPrescripteur = page.getByLabel('Médecin prescripteur');
  await champPrescripteur.fill(medecinBase.name.slice(0, 6));
  await champPrescripteur.press('Escape'); // referme la liste d'assistance sans changer la valeur
  await champPrescripteur.fill(medecinBase.name);
  await page.getByRole('button', { name: `Encaisser ${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ar`, exact: true }).click();
  await expectJobs(page, 1);
  await closePrint(page);
  await expectJobs(page, 2);
  await closePrint(page);
  await expectJobs(page, 3);
  const attempts = await page.evaluate(() => window.__printAttempts);
  expect(attempts[1].text).toContain(`${labArticle.name} × 2`);
  expect(attempts[2].text).toContain(echoArticle.name);
  expect(attempts[2].text).toContain('Client Externe');
  await closePrint(page);
  await expect.poll(async () => (await browserState(page)).invoices.length).toBe(1);
  const saved = await browserState(page);
  expect(saved.invoices[0]).toMatchObject({ isExternal: true, status: 'paid', patientCharge: total });
  // Le prescripteur saisi est repris sur les bons et dans la base (consultation externe).
  expect(attempts[1].text).toContain(medecinBase.name);
  expect(attempts[2].text).toContain(medecinBase.name);
  expect(saved.consultations[0].doctorName).toBe(medecinBase.name);
  expect(saved.labRequests).toHaveLength(2);
  expect(saved.labRequests.every((request) => request.status === 'paid' && request.invoiceId === saved.invoices[0].id)).toBe(true);
  expect(saved.consultations[0].echoRequests?.[0].status).toBe('paid');
  for (const article of state.articles) expect(saved.articles.find((item) => item.id === article.id)?.stockPharmacie).toBe(article.stockPharmacie);
  const receipt = page.getByRole('region', { name: 'Dernier encaissement' });
  await receipt.getByRole('button', { name: 'Bon échographie', exact: true }).click();
  await expectJobs(page, 4);
  expect((await browserState(page)).invoices).toEqual(saved.invoices);
  expect((await browserState(page)).consultations).toEqual(saved.consultations);
  await closePrint(page);
});

test('une impression silencieusement bloquée affiche un avertissement sans annuler le paiement', async ({ page }) => {
  await openCashier(page);
  await page.evaluate(() => { window.__printMode = 'blocked'; });
  await page.getByTitle('Ouvrir la facture en fenêtre modale').click();
  await page.getByRole('button', { name: 'Encaisser 40 000,00 Ar', exact: true }).click();
  const notice = page.getByRole('alert', { name: 'Erreur d’impression', exact: true });
  await expect(notice).toContainText("Bon d'échographie");
  await expect(notice).toContainText('sans encaisser à nouveau');
  await expect(notice.getByRole('link', { name: 'Ouvrir dans un nouvel onglet' })).toHaveAttribute('target', '_blank');
  await expect(page.locator('iframe[data-salfa-print]')).toHaveCount(0);
  const saved = await browserState(page);
  expect(saved.invoices.every((inv) => inv.status === 'paid')).toBe(true);
  await page.setViewportSize({ width: 320, height: 960 });
  const bounds = await notice.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Fermer l’avertissement d’impression' }).click();
  await page.evaluate(() => { window.__printMode = 'hold'; });
  await page.getByRole('region', { name: 'Dernier encaissement' }).getByRole('button', { name: 'Bon laboratoire', exact: true }).click();
  await expectJobs(page, 1);
  expect((await browserState(page)).invoices).toEqual(saved.invoices);
  await closePrint(page);
});

test('les factures SALFA A5 et les bons thermiques partagent la même file', async ({ page }) => {
  await installPrintMock(page);
  await emptyOrigin(page);
  await page.evaluate(async ({ config, pat, inv, exams }) => {
    // @ts-expect-error Modules source servis par Vite dans le navigateur.
    const { printSalfaIndividualInvoice } = await import('/src/utils/printSalfaInvoice.ts');
    // @ts-expect-error Module source servi par Vite dans le navigateur.
    const { printEchoRequestTicket } = await import('/src/utils/printTicket.ts');
    printSalfaIndividualInvoice(config, inv, pat);
    printEchoRequestTicket(config, pat, undefined, new Date(), exams);
  }, { config: settings, pat: patient, inv: invoices[1], exams: [echo] });
  await expectJobs(page, 1);
  expect(await page.evaluate(() => window.__printAttempts[0].title)).toMatch(/^Facture /);
  await closePrint(page);
  await expectJobs(page, 2);
  expect(await page.evaluate(() => window.__printAttempts[1].title)).toBe("BON D'ÉCHOGRAPHIE");
  await closePrint(page);
});
