import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import { sharedTransactions, writeSharedTable, fusionnerPrescription, annulerFusionPrescription } from '../src/modules/assurance/sharedData';

function base(): AppState {
  const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  return { ...seed,
    companies: [{ id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance', tauxCouverture: 80 }],
    patients: [{ ...seed.patients[0], id: 'patient-1', lastName: 'RAKOTO', firstName: 'TEST', company: 'ASSURANCE COMMUNE', clientType: 'societe', matricule: 'MAT-COMMUN' }],
    invoices: [{ id: 'invoice-1', patientId: 'patient-1', clientType: 'societe', isExternal: false, status: 'pending', creditSociete: true, totalAmount: 10000, patientCharge: 10000, createdAt: '2026-09-10T08:00:00Z', items: [{ description: 'Consultation', category: 'consultation', amount: 10000 }] }],
    ventes: [], ventePayments: [], companyBillingAccounts: [], assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [] };
}

const saisie = (id: string, numero: string, total: number): any => ({
  id, numeroFacture: numero, date: '2026-09-10', dateCreation: '2026-09-10T08:00:00Z',
  societeId: 'soc-1', personneId: 'patient-1', sousSociete: '', nomAgent: 'RAKOTO TEST', matricule: 'MAT-COMMUN',
  totalPrestation: total, montantTotal: total, participation: 0, ticketModerateur: 0,
  montantARembourser: total, statut: 'En attente', lignes: [{ id: `${id}:l1`, prestationId: id, code: 'CONS', libelle: 'Acte', totalPrestation: total, totalPaye: 0 }],
});

test('fusion : la prescription Caisse absorbe une prescription du suivi (même société)', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId)!;
  const deux = saisie('saisie-2', 'FA-09/ASC/26-002', 5000);
  const avecSaisie = writeSharedTable(state, 'assurancePrestations', [deux]);
  const courantes = sharedTransactions(avecSaisie).prestations;

  const fusionnees = fusionnerPrescription(courantes, caisse, 'saisie-2', 'Retour du patient le lendemain');
  const fusion = fusionnees.find(p => p.id === 'saisie-2')!;
  expect(fusionnees.some(p => p.id === caisse.id)).toBe(false); // l'absorbée disparaît
  expect(fusion.totalPrestation).toBe(15000);                    // 10 000 + 5 000
  expect(fusion.montantARembourser).toBe(15000);
  expect(fusion.fusionsAnnulees?.[0]?.numeroFacture).toBe(caisse.numeroFacture);
  expect(fusion.commentaires).toContain(caisse.numeroFacture);   // traçabilité
  expect(fusion.commentaires).toContain('Retour du patient');

  // La fusion traverse writeSharedTable (la facture Caisse reste intacte).
  const saved = writeSharedTable(avecSaisie, 'assurancePrestations', fusionnees);
  expect(saved.invoices[0].totalAmount).toBe(10000);
  const relu = sharedTransactions(saved).prestations;
  expect(relu.some(p => p.id === caisse.id)).toBe(false);
  expect(relu.find(p => p.id === 'saisie-2')!.totalPrestation).toBe(15000);
});

test('annulation : les deux prescriptions initiales sont restituées', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId)!;
  const deux = saisie('saisie-2', 'FA-09/ASC/26-002', 5000);
  const avecSaisie = writeSharedTable(state, 'assurancePrestations', [deux]);
  const fusionnees = fusionnerPrescription(sharedTransactions(avecSaisie).prestations, caisse, 'saisie-2');
  const sauvegarde = writeSharedTable(avecSaisie, 'assurancePrestations', fusionnees);

  const { prestations: restituees, restituee } = annulerFusionPrescription(sharedTransactions(sauvegarde).prestations, 'saisie-2');
  expect(restituee.numeroFacture).toBe(caisse.numeroFacture);
  expect(restituee.totalPrestation).toBe(10000);
  const fusion = restituees.find(p => p.id === 'saisie-2')!;
  expect(fusion.totalPrestation).toBe(5000);
  expect(restituees.some(p => p.id === caisse.id)).toBe(true);

  // Et l'état annulé repasse la validation de la base commune.
  const final = writeSharedTable(sauvegarde, 'assurancePrestations', restituees);
  expect(sharedTransactions(final).prestations).toHaveLength(2);
});

test('fusion refusée entre sociétés différentes ou vers une facture Caisse', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId)!;
  // Société différente → refusée.
  const autre = { ...saisie('saisie-x', 'FA-09/AUT/26-001', 1000), societeId: 'soc-autre' };
  expect(() => fusionnerPrescription([...sharedTransactions(state).prestations, autre], caisse, 'saisie-x')).toThrow(/même société/i);
  // Cible = facture Caisse → refusée.
  const autreCaisse = { ...saisie('caisse:invoice-2', 'FA-09/ASC/26-003', 2000), sourceInvoiceId: 'invoice-2' };
  expect(() => fusionnerPrescription([...sharedTransactions(state).prestations, autreCaisse], caisse, 'caisse:invoice-2')).toThrow(/suivi assurance/i);
});
