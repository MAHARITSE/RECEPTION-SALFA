import { expect, test, type Page } from '@playwright/test';
import type { BillingDocument } from '../src/modules/assurance/monthlyBilling';
import type { Paiement, Prestation } from '../src/modules/assurance/types';
import { creerPaiementGlobal, numeroBordereauPropose, repartitionReglementGlobal, soldeDocument } from '../src/modules/assurance/utils/reglementGlobal';
import { reconcilePrestationsWithPaiements } from '../src/modules/assurance/utils/reconcile';

const doc = (overrides: Partial<BillingDocument> = {}): BillingDocument => ({
  id: 'doc-1', sourceId: 'src-1', category: 'societe', companyId: 'soc-1', companyName: 'JIRAMA',
  number: 'FA-09/JIR/26-001', date: '2026-09-03', client: 'RAKOTO Jean', dossier: 'DOS-1', matricule: 'MAT-1',
  total: 40000, copay: 8000, payable: 32000, paid: 0, rejected: 0,
  items: [{ description: 'Consultation', amount: 40000 }],
  ...overrides,
});

const prestation = (overrides: Partial<Prestation> = {}): Prestation => ({
  id: 'doc-1', numeroFacture: 'FA-09/JIR/26-001', date: '2026-09-03', societeId: 'soc-1', societeNom: 'JIRAMA',
  sousSociete: '', personneId: 'p-1', nomAgent: 'RAKOTO Jean', matricule: 'MAT-1',
  totalPrestation: 40000, participation: 8000, montantARembourser: 32000, totalPaye: 0, montantExclu: 0,
  statut: 'En attente', dateCreation: '2026-09-03T08:00:00Z',
  lignes: [{ id: 'l-1', prestationId: 'doc-1', code: 'CONS', libelle: 'Consultation', totalPrestation: 40000, totalPaye: 0 }],
  ...overrides,
});

test('solde d\'une pièce : payable − payé − rejeté, jamais négatif', () => {
  expect(soldeDocument({ payable: 32000, paid: 12000, rejected: 0 })).toBe(20000);
  expect(soldeDocument({ payable: 10000, paid: 9000, rejected: 2000 })).toBe(0);
  expect(soldeDocument({ payable: 0, paid: 0, rejected: 0 })).toBe(0);
});

test('répartition FIFO : la facture la plus ancienne est soldée en premier', () => {
  const docs = [
    doc({ id: 'b', number: 'FA-09/JIR/26-002', date: '2026-09-08', payable: 10000 }),
    doc({ id: 'a', number: 'FA-09/JIR/26-001', date: '2026-09-03', payable: 20000 }),
    doc({ id: 'c', number: 'FA-09/JIR/26-003', date: '2026-09-10', payable: 5000 }),
  ];
  const estPrestation = (d: BillingDocument) => d.id !== 'c'; // c : vente Caisse non imputable

  // Règlement partiel de 22 000 : 20 000 sur la plus ancienne, 2 000 sur la suivante.
  const partiel = repartitionReglementGlobal(docs, 22000, estPrestation);
  expect(partiel.imputations.find(i => i.doc.id === 'a')?.montant).toBe(20000);
  expect(partiel.imputations.find(i => i.doc.id === 'b')?.montant).toBe(2000);
  expect(partiel.imputations.find(i => i.doc.id === 'c')?.montant).toBe(0);
  expect(partiel.imputations.find(i => i.doc.id === 'c')?.imputable).toBe(false);
  expect(partiel.reste).toBe(0);

  // Un montant supérieur au solde imputable est plafonné : reste = excédent.
  const excessif = repartitionReglementGlobal(docs, 999999, estPrestation);
  expect(excessif.imputations.find(i => i.doc.id === 'a')?.montant).toBe(20000);
  expect(excessif.imputations.find(i => i.doc.id === 'b')?.montant).toBe(10000);
  expect(excessif.soldeImputable).toBe(30000);
  expect(excessif.reste).toBe(999999 - 30000);
});

test('numéro de bordereau proposé : séquence unique par société et par mois', () => {
  expect(numeroBordereauPropose('BSA', '2026-09', [])).toBe('REG-BSA-202609-001');
  const existants = ['REG-BSA-202609-001', 'reg-bsa-202609-002 '];
  expect(numeroBordereauPropose('BSA', '2026-09', existants)).toBe('REG-BSA-202609-003');
  // Un autre mois repart à 1 ; une autre société aussi.
  expect(numeroBordereauPropose('BSA', '2026-10', existants)).toBe('REG-BSA-202610-001');
  expect(numeroBordereauPropose('JIRAMA', '2026-09', existants)).toBe('REG-JIRAMA-202609-001');
});

test('règlement global enregistré : les prescriptions passent à Payé via la réconciliation', () => {
  const docs = [
    doc({ id: 'p-ancienne', number: 'FA-09/JIR/26-001', date: '2026-09-03', payable: 20000 }),
    doc({ id: 'p-recente', number: 'FA-09/JIR/26-002', date: '2026-09-08', payable: 10000 }),
  ];
  const prestations = [
    prestation({ id: 'p-ancienne', numeroFacture: 'FA-09/JIR/26-001', montantARembourser: 20000 }),
    prestation({ id: 'p-recente', numeroFacture: 'FA-09/JIR/26-002', montantARembourser: 10000 }),
  ];
  const societe = { id: 'soc-1', nom: 'JIRAMA', code: 'JIR', modePaiement: 'global' as const };

  // Paiement intégral du solde : les deux prescriptions sont soldées.
  const repartition = repartitionReglementGlobal(docs, 30000, () => true);
  const paiement: Paiement = creerPaiementGlobal({
    societe, month: '2026-09', montant: 30000, datePaiement: '2026-09-30', modePaiement: 'Virement bancaire',
    numeroBordereau: 'REG-JIR-202609-001', repartition, prestations,
    generateId: prefix => `${prefix}-test`, horodatage: '2026-09-30T10:00:00Z',
  });
  expect(paiement.totalPaye).toBe(30000);
  expect(paiement.lignes).toHaveLength(2);
  expect(paiement.statut).toBe('Validé');

  const reconciliees = reconcilePrestationsWithPaiements(prestations, [paiement]);
  expect(reconciliees.map(p => p.statut)).toEqual(['Payé', 'Payé']);
  expect(reconciliees.map(p => p.totalPaye)).toEqual([20000, 10000]);
  expect(reconciliees.every(p => p.resteAPayer === 0)).toBe(true);
  expect(reconciliees[0].numeroBordereau).toBe('REG-JIR-202609-001');

  // Paiement partiel de 22 000 : la plus ancienne payée, la seconde partiellement.
  const repartitionPartielle = repartitionReglementGlobal(docs, 22000, () => true);
  const paiementPartiel = creerPaiementGlobal({
    societe, month: '2026-09', montant: 22000, datePaiement: '2026-09-29', modePaiement: 'Chèque',
    numeroBordereau: 'REG-JIR-202609-002', repartition: repartitionPartielle, prestations,
    generateId: prefix => `${prefix}-test`, horodatage: '2026-09-29T10:00:00Z',
  });
  const apresPartiel = reconcilePrestationsWithPaiements(prestations, [paiementPartiel]);
  expect(apresPartiel.find(p => p.id === 'p-ancienne')).toMatchObject({ statut: 'Payé', totalPaye: 20000 });
  expect(apresPartiel.find(p => p.id === 'p-recente')).toMatchObject({ statut: 'Partiellement payé', totalPaye: 2000, resteAPayer: 8000 });
});

/* ===== Test UI : bouton Paiement dans la liste de facturation (Vue par Facture) ===== */

async function login(page: Page) {
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption('USR-BIL');
  await page.getByLabel('Mot de passe', { exact: true }).fill('fact123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const { loadStateFromBrowser } = await import('/src/browserDb.ts');
    return loadStateFromBrowser();
  });
}

test('le bouton Paiement d\'un payeur global enregistre le montant réglé de la facture mensuelle', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await page.locator('#nav-tab-prestations').click();
  const liste = page.getByTestId('monthly-invoices-view');
  await expect(liste).toBeVisible();

  // Une société payeur global (défaut de la base) propose le bouton Paiement.
  const bouton = liste.getByRole('button', { name: /^Enregistrer le paiement de la facture de/ }).first();
  await expect(bouton).toBeVisible();
  const scopeId = await bouton.locator('xpath=ancestor::tr[1]').getAttribute('data-monthly-scope');
  const ligne = page.locator(`tr[data-monthly-scope="${scopeId}"]`);
  const libelle = await bouton.getAttribute('aria-label');

  await bouton.click();
  const modal = page.getByRole('dialog', { name: /Enregistrer le paiement/ });
  await expect(modal).toBeVisible();
  // Le montant proposé couvre tout le solde restant de la facture mensuelle.
  const soldePropose = Number(await modal.getByLabel('Montant réglé').inputValue());
  expect(soldePropose).toBeGreaterThan(0);

  await modal.getByRole('button', { name: /Enregistrer le paiement \(/ }).click();
  await expect(page.getByText(/Règlement de .* enregistré pour .* — bordereau REG-/)).toBeVisible();

  // La ligne passe à « Soldée » et le bordereau est persisté dans la base commune.
  await expect(ligne.getByText('Soldée', { exact: true })).toBeVisible();
  await expect(liste.getByRole('button', { name: libelle! })).toHaveCount(0);
  const state = await storedState(page);
  expect(state?.assurancePaiements?.some(p => p.numeroBordereau.startsWith('REG-') && p.totalPaye === soldePropose)).toBe(true);
});
