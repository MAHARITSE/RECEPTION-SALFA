import { expect, test } from '@playwright/test';
import type { AppState } from '../src/store';
import { ensureAssuranceCollections } from '../src/modules/assurance/state';
import { collectDeletions, mergeStates, sameBusinessData } from '../src/syncMerge';
import { reconcilePrestationsWithPaiements } from '../src/modules/assurance/utils/reconcile';
import type { Prestation, Paiement } from '../src/modules/assurance/types';
import { readFileSync } from 'node:fs';
const seed = JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8'));

function prestation(societeId = 'assureur-1'): Prestation {
  return {
    id: `prestation-${societeId}`, numeroFacture: 'FAC-001', date: '2026-09-10',
    societeId, personneId: 'personne-1', sousSociete: '', totalPrestation: 10000,
    participation: 2000, montantARembourser: 8000, dateCreation: '2026-09-10', statut: 'En attente',
    lignes: [{ id: `ligne-${societeId}`, prestationId: `prestation-${societeId}`, code: 'CONS', totalPrestation: 10000, ticketModerateur: 2000, montantARembourser: 8000, totalPaye: 0 }],
  };
}

function paiement(net: number, exclu = 0): Paiement {
  return {
    id: 'reglement-1', numeroBordereau: 'BORD-001', datePaiement: '2026-09-10', dateSaisie: '2026-09-10T08:00:00Z',
    societeId: 'assureur-1', modePaiement: 'Virement bancaire', referencePaiement: 'VIR-001',
    totalReclame: 10000, totalPaye: net, totalModerateur: 2000, totalExclu: exclu, remise: 0, statut: 'Validé',
    lignes: [{ id: 'reglement-ligne-1', paiementId: 'reglement-1', prestationId: 'prestation-assureur-1', lignePrestationId: 'ligne-assureur-1', prestationNumero: 'FAC-001', immatriculation: 'MAT-001', nomBaseAssurance: 'Assuré test', totalPaye: net, ticketModerateur: 2000, montantExclu: exclu }],
  };
}

test('règlement partiel, soldé, rejet et suppression recalculent les soldes', () => {
  const source = prestation();
  const [partial] = reconcilePrestationsWithPaiements([source], [paiement(3000)]);
  expect(partial).toMatchObject({ totalPaye: 3000, resteAPayer: 5000, statut: 'Partiellement payé' });
  expect(partial.lignes[0]).toMatchObject({ totalPaye: 3000, montantExclu: 0 });
  const [paid] = reconcilePrestationsWithPaiements([partial], [paiement(8000)]);
  expect(paid).toMatchObject({ totalPaye: 8000, resteAPayer: 0, statut: 'Payé' });
  const [rejected] = reconcilePrestationsWithPaiements([paid], [paiement(0, 8000)]);
  expect(rejected).toMatchObject({ totalPaye: 0, montantExclu: 8000, resteAPayer: 0, statut: 'Rejeté' });
  const [reset] = reconcilePrestationsWithPaiements([rejected], []);
  expect(reset).toMatchObject({ totalPaye: 0, montantExclu: 0, resteAPayer: 8000, statut: 'En attente' });
  expect(source.lignes[0].totalPaye).toBe(0);
});

test('un même numéro de facture chez deux garants ne mélange pas les règlements', () => {
  const [one, two] = reconcilePrestationsWithPaiements([prestation(), prestation('assureur-2')], [paiement(8000)]);
  expect(one.totalPaye).toBe(8000);
  expect(two.totalPaye).toBe(0);
  expect(two.resteAPayer).toBe(8000);
});

test('la mise à niveau conserve toutes les données historiques et les collections existantes', () => {
  const old = structuredClone(seed) as unknown as AppState;
  const upgraded = ensureAssuranceCollections(old);
  expect(upgraded.invoices).toEqual(old.invoices);
  expect(upgraded.companyBillingAccounts).toEqual(old.companyBillingAccounts);
  expect(upgraded.ventes).toEqual(old.ventes);
  expect(upgraded.assurancePrestations).toEqual([]);
  expect(upgraded.assuranceFamilles?.length).toBeGreaterThan(0);
  const populated = { ...upgraded, assurancePrestations: [prestation()] };
  expect(ensureAssuranceCollections(populated)).toEqual(populated);
});

test('la fusion multi-onglets conserve les créations et les suppressions assurance', () => {
  const base = ensureAssuranceCollections(structuredClone(seed) as unknown as AppState);
  const local = { ...base, assurancePrestations: [prestation()] };
  const remote = { ...base, assurancePrestations: [prestation('assureur-2')] };
  const merged = mergeStates(base, local, remote);
  expect(merged.assurancePrestations).toHaveLength(2);
  expect(sameBusinessData(local, merged)).toBe(false);
  expect(merged.invoices).toEqual(base.invoices);
  const deleted = { ...merged, assurancePrestations: [prestation('assureur-2')] };
  expect(collectDeletions(merged, deleted).assurancePrestations).toEqual(['prestation-assureur-1']);
  expect(mergeStates(merged, deleted, merged).assurancePrestations).toEqual(deleted.assurancePrestations);
});
