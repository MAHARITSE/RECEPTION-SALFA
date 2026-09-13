import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../src/store';
import { sharedTransactions, writeSharedTable, fusionnerPrescription, annulerFusionPrescription } from '../src/modules/assurance/sharedData';

function base(): AppState {
  const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
  return { ...seed,
    companies: [{ id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance', tauxCouverture: 80 }],
    patients: [{ ...seed.patients[0], id: 'patient-1', lastName: 'RAKOTO', firstName: 'TEST', company: 'ASSURANCE COMMUNE', clientType: 'societe', matricule: 'MAT-COMMUN' }],
    invoices: [
      { id: 'invoice-1', patientId: 'patient-1', clientType: 'societe', isExternal: false, status: 'pending', creditSociete: true, totalAmount: 10000, patientCharge: 10000, createdAt: '2026-09-10T08:00:00Z', items: [{ description: 'Consultation', category: 'consultation', amount: 10000 }] },
      { id: 'invoice-2', patientId: 'patient-1', clientType: 'societe', isExternal: false, status: 'pending', creditSociete: true, totalAmount: 8000, patientCharge: 8000, createdAt: '2026-09-05T08:00:00Z', items: [{ description: 'Ordonnance', category: 'pharmacy', amount: 8000 }] },
    ],
    ventes: [], ventePayments: [], companyBillingAccounts: [], assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [] };
}

const saisie = (id: string, numero: string, total: number): any => ({
  id, numeroFacture: numero, date: '2026-09-10', dateCreation: '2026-09-10T08:00:00Z',
  societeId: 'soc-1', personneId: 'patient-1', sousSociete: '', nomAgent: 'RAKOTO TEST', matricule: 'MAT-COMMUN',
  totalPrestation: total, montantTotal: total, participation: 0, ticketModerateur: 0,
  montantARembourser: total, statut: 'En attente', lignes: [{ id: `${id}:l1`, prestationId: id, code: 'CONS', libelle: 'Acte', totalPrestation: total, totalPaye: 0 }],
});

/** Écrit la liste comme le fait l'interface : la liste dérivée complète est soumise. */
function ecrire(state: AppState, fusionnees: any[]): AppState {
  return writeSharedTable(state, 'assurancePrestations', fusionnees);
}

test('fusion : la prescription Caisse absorbe une prescription du suivi (même société)', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId)!;
  const avecSaisie = ecrire(state, [...sharedTransactions(state).prestations, saisie('saisie-2', 'FA-09/ASC/26-002', 5000)]);
  const courantes = sharedTransactions(avecSaisie).prestations;

  const fusionnees = fusionnerPrescription(courantes, caisse, 'saisie-2', 'Retour du patient le lendemain');
  const fusion = fusionnees.find(p => p.id === 'saisie-2')!;
  expect(fusionnees.some(p => p.id === caisse.id)).toBe(false); // l'absorbée disparaît
  expect(fusion.totalPrestation).toBe(15000);                    // 10 000 + 5 000
  expect(fusion.montantARembourser).toBe(15000);
  expect(fusion.fusionsAnnulees?.[0]?.numeroFacture).toBe(caisse.numeroFacture);
  expect(fusion.commentaires).toContain(caisse.numeroFacture);   // traçabilité
  expect(fusion.commentaires).toContain('Retour du patient');
  expect(fusion.lignes.some(l => l.id.startsWith(`${caisse.id}:fus:`))).toBe(true); // les actes migrent

  // La fusion traverse writeSharedTable (la facture Caisse reste intacte).
  const saved = ecrire(avecSaisie, fusionnees);
  expect(saved.invoices[0].totalAmount).toBe(10000);
  const relu = sharedTransactions(saved).prestations;
  expect(relu.some(p => p.id === caisse.id)).toBe(false);
  expect(relu.find(p => p.id === 'saisie-2')!.totalPrestation).toBe(15000);
});

test('fusion de deux factures Caisse de dates différentes en une seule', () => {
  const state = base();
  const prestations = sharedTransactions(state).prestations;
  const ancienne = prestations.find(p => p.sourceInvoiceId === 'invoice-2')!; // 2026-09-05 · 8 000
  const recente = prestations.find(p => p.sourceInvoiceId === 'invoice-1')!;  // 2026-09-10 · 10 000

  // La facture récente est conservée (son numéro reste), l'ancienne est absorbée.
  const fusionnees = fusionnerPrescription(prestations, ancienne, recente.id, 'Patient revenu le 10/09');
  expect(fusionnees.some(p => p.id === ancienne.id)).toBe(false);
  const fusion = fusionnees.find(p => p.id === recente.id)!;
  expect(fusion.totalPrestation).toBe(18000);
  expect(fusion.montantARembourser).toBe(18000);
  expect(fusion.lignes).toHaveLength(2);                    // les actes des deux factures
  expect(fusion.lignes.some(l => l.id.startsWith(`${ancienne.id}:fus:`))).toBe(true);
  expect(fusion.fusionsAnnulees?.[0]?.sourceInvoiceId).toBe('invoice-2');
  expect(fusion.commentaires).toContain(ancienne.numeroFacture); // numéro tracé

  // Persistance : la facture absorbée est masquée, la facture Caisse conservée reste intacte.
  const saved = ecrire(state, fusionnees);
  expect(saved.invoices.map(i => i.totalAmount)).toEqual([10000, 8000]);
  const relu = sharedTransactions(saved).prestations;
  expect(relu.some(p => p.id === ancienne.id)).toBe(false);
  const fusionRelue = relu.find(p => p.id === recente.id)!;
  expect(fusionRelue.totalPrestation).toBe(18000);
  expect(fusionRelue.lignes).toHaveLength(2);
  expect(fusionRelue.fusionsAnnulees?.[0]?.sourceInvoiceId).toBe('invoice-2'); // trace portée à la relecture

  // Annulation : les deux factures de départ sont restituées.
  const { prestations: restituees } = annulerFusionPrescription(sharedTransactions(saved).prestations, recente.id);
  const sauvegarde = ecrire(saved, restituees);
  const final = sharedTransactions(sauvegarde).prestations;
  expect(final.some(p => p.id === ancienne.id)).toBe(true);
  expect(final.find(p => p.id === recente.id)!.totalPrestation).toBe(10000);
  expect(final.find(p => p.sourceInvoiceId === 'invoice-2')!.totalPrestation).toBe(8000);
});

test('fusion d\'une saisie du suivi dans une facture Caisse : absorbée retirée puis restituée', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId === 'invoice-1')!;
  const avecSaisie = ecrire(state, [...sharedTransactions(state).prestations, saisie('saisie-2', 'FA-09/ASC/26-002', 5000)]);
  const courantes = sharedTransactions(avecSaisie).prestations;

  const fusionnees = fusionnerPrescription(courantes, courantes.find(p => p.id === 'saisie-2')!, caisse.id);
  const fusion = fusionnees.find(p => p.id === caisse.id)!;
  expect(fusionnees.some(p => p.id === 'saisie-2')).toBe(false);
  expect(fusion.totalPrestation).toBe(15000);

  const saved = ecrire(avecSaisie, fusionnees);
  const relu = sharedTransactions(saved).prestations;
  expect(relu.some(p => p.id === 'saisie-2')).toBe(false);
  expect(relu.find(p => p.id === caisse.id)!.totalPrestation).toBe(15000);

  // Annulation : la saisie revient intacte avec ses lignes.
  const { prestations: restituees, restituee } = annulerFusionPrescription(sharedTransactions(saved).prestations, caisse.id);
  expect(restituee.id).toBe('saisie-2');
  expect(restituee.totalPrestation).toBe(5000);
  expect(restituee.lignes.some(l => l.id === 'saisie-2:l1')).toBe(true);
  const sauvegarde = ecrire(saved, restituees);
  const final = sharedTransactions(sauvegarde).prestations;
  expect(final.find(p => p.id === 'saisie-2')!.totalPrestation).toBe(5000);
  expect(final.find(p => p.id === caisse.id)!.totalPrestation).toBe(10000);
});

test('annulation : les deux prescriptions initiales sont restituées', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId === 'invoice-1')!;
  const avecSaisie = ecrire(state, [...sharedTransactions(state).prestations, saisie('saisie-2', 'FA-09/ASC/26-002', 5000)]);
  const fusionnees = fusionnerPrescription(sharedTransactions(avecSaisie).prestations, caisse, 'saisie-2');
  const sauvegarde = ecrire(avecSaisie, fusionnees);

  const { prestations: restituees, restituee } = annulerFusionPrescription(sharedTransactions(sauvegarde).prestations, 'saisie-2');
  expect(restituee.numeroFacture).toBe(caisse.numeroFacture);
  expect(restituee.totalPrestation).toBe(10000);
  const fusion = restituees.find(p => p.id === 'saisie-2')!;
  expect(fusion.totalPrestation).toBe(5000);
  expect(restituees.some(p => p.id === caisse.id)).toBe(true);

  // Et l'état annulé repasse la validation de la base commune (2 factures Caisse + la saisie).
  const final = ecrire(sauvegarde, restituees);
  expect(sharedTransactions(final).prestations).toHaveLength(3);
});

test('fusion refusée : même prescription ou sociétés différentes', () => {
  const state = base();
  const caisse = sharedTransactions(state).prestations.find(p => p.sourceInvoiceId === 'invoice-1')!;
  // Même prescription → refusée.
  expect(() => fusionnerPrescription(sharedTransactions(state).prestations, caisse, caisse.id)).toThrow(/différentes/i);
  // Société différente → refusée.
  const autre = { ...saisie('saisie-x', 'FA-09/AUT/26-001', 1000), societeId: 'soc-autre' };
  expect(() => fusionnerPrescription([...sharedTransactions(state).prestations, autre], caisse, 'saisie-x')).toThrow(/même société/i);
});
