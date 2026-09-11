import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import { sharedTransactions, writeSharedTable } from '../src/modules/assurance/sharedData';
import type { Prestation } from '../src/modules/assurance/types';

function base(): AppState {
  const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  return { ...seed,
    companies: [{ id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance', tauxCouverture: 80 }],
    patients: [{ ...seed.patients[0], id: 'patient-1', lastName: 'RAKOTO', firstName: 'TEST', company: 'ASSURANCE COMMUNE', clientType: 'societe', matricule: 'MAT-COMMUN' }],
    invoices: [{ id: 'invoice-1', patientId: 'patient-1', clientType: 'societe', isExternal: false, status: 'pending', creditSociete: true, totalAmount: 10000, patientCharge: 10000, createdAt: '2026-09-10T08:00:00Z', items: [
      { description: 'Consultation', category: 'consultation', amount: 10000 },
    ] }],
    ventes: [], ventePayments: [], companyBillingAccounts: [], assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [] };
}

const ajoutOmission = (p: Prestation) => ({
  id: `${p.id}:facturier:1`, prestationId: p.id, code: 'LAB', libelle: 'ORDONNANCE EXTERNE — BIOLOGIE',
  totalPrestation: 4000, ticketModerateur: 400, montantARembourser: 3600, totalPaye: 0,
  origine: 'ordonnance_externe' as const,
});

test('le facturier ajoute une omission / ordonnance externe à une prescription Caisse', () => {
  const state = base();
  const merged = sharedTransactions(state).prestations;
  const p = merged[0];
  const ajouts = [ajoutOmission(p)];
  const modifie: Prestation = {
    ...p,
    lignes: [...p.lignes, ...ajouts],
    ajouts,
    totalPrestation: 14000, montantTotal: 14000,
    participation: 400, ticketModerateur: 400,
    montantARembourser: 13600,
    commentaires: 'Ordonnance externe du 10/09 réglée par l\'hôpital.',
  };
  const saved = writeSharedTable(state, 'assurancePrestations', [modifie]);
  // La facture Caisse d'origine reste intacte.
  expect(saved.invoices[0].totalAmount).toBe(10000);
  // Le complément est conservé à côté, sans copier la facture.
  expect((saved.assurancePrestations || []).filter(x => x.sourceInvoiceId)).toHaveLength(1);
  // À la relecture, l'ajout est superposé à la prescription.
  const relu = sharedTransactions(saved).prestations[0];
  expect(relu.totalPrestation).toBe(14000);
  expect(relu.participation).toBe(400);
  expect(relu.montantARembourser).toBe(13600);
  expect(relu.lignes).toHaveLength(2);
  expect(relu.lignes[1]).toMatchObject({ code: 'LAB', origine: 'ordonnance_externe' });
  expect(relu.commentaires).toContain('Ordonnance externe');
  // Ré-enregistrer la prescription relue ne duplique pas l'ajout.
  const resaved = writeSharedTable(saved, 'assurancePrestations', sharedTransactions(saved).prestations);
  expect(relu.lignes).toHaveLength(2);
  const relu2 = sharedTransactions(resaved).prestations[0];
  expect(relu2.lignes).toHaveLength(2);
  expect(relu2.totalPrestation).toBe(14000);
});

test('les actes d\'origine restent verrouillés : modification, suppression et retrait interdits', () => {
  const state = base();
  const p = sharedTransactions(state).prestations[0];

  // Modifier un acte d'origine → refusé.
  const modifiee: Prestation = { ...p, lignes: p.lignes.map(l => ({ ...l, totalPrestation: 5000 })), totalPrestation: 5000, montantARembourser: 5000 };
  expect(() => writeSharedTable(state, 'assurancePrestations', [modifiee]))
    .toThrow(/actes de la facture Caisse restent inchangés/i);

  // Supprimer la prescription liée → refusé.
  expect(() => writeSharedTable(state, 'assurancePrestations', []))
    .toThrow(/ne peut pas être supprimée/i);

  // Une ligne ajoutée sans origine reconnue → refusée.
  const sansOrigine: Prestation = { ...p, lignes: [...p.lignes, { ...ajoutOmission(p), origine: undefined }], totalPrestation: 14000, participation: 400, montantARembourser: 13600 };
  expect(() => writeSharedTable(state, 'assurancePrestations', [sansOrigine]))
    .toThrow(/omission ou une ordonnance externe/i);

  // Un total incohérent avec les lignes ajoutées → refusé.
  const totalFaux: Prestation = { ...p, lignes: [...p.lignes, ajoutOmission(p)], totalPrestation: 99999, participation: 400, montantARembourser: 99599 };
  expect(() => writeSharedTable(state, 'assurancePrestations', [totalFaux]))
    .toThrow(/ne correspond pas aux lignes ajoutées/i);
});

test('une prescription sans complément n\'écrit rien dans la base assurance', () => {
  const state = base();
  const p = sharedTransactions(state).prestations[0];
  const saved = writeSharedTable(state, 'assurancePrestations', [p]);
  expect(saved.assurancePrestations).toEqual([]);
  expect(saved.invoices).toEqual(state.invoices);
});
