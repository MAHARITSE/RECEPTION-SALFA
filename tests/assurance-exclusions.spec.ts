import { expect, test } from '@playwright/test';
import type { AppState } from '../src/store';
import type { ExclusionSociete, Prestation, Societe } from '../src/modules/assurance/types';
import { sharedSocietes, writeSharedTable } from '../src/modules/assurance/sharedData';
import {
  exclusionActe,
  exclusionPersonne,
  repartirActe,
  repartirPrestation,
  resumerExclusions,
  societeModePaiement,
} from '../src/modules/assurance/utils/societeExclusions';
import { reconcilePrestationsWithPaiements } from '../src/modules/assurance/utils/reconcile';

const societe = (overrides: Partial<Societe> = {}): Societe => ({
  id: 'soc-1', nom: 'ASSURANCE COMMUNE', code: 'AC', tauxCouvertureDefaut: 80, ...overrides,
});

const familleEcho: ExclusionSociete = {
  id: 'exc-1', type: 'famille', familleCode: 'ECHO', familleLibelle: 'Échographie & Imagerie Médicale',
  motsCles: ['ECHOGRAPHIE', 'Échographie & Imagerie Médicale'], tauxPriseEnCharge: 0, actif: true,
};

const exclusionAssure: ExclusionSociete = {
  id: 'exc-2', type: 'personne', personneId: 'patient-1', nomPrenom: 'RAKOTO TEST',
  matricule: 'MAT-1', tauxPriseEnCharge: 0, actif: true, motif: 'Contrat résilié',
};

test('les deux grandes familles de sociétés : payeur global et paiement partiel', () => {
  expect(societeModePaiement(societe({ modePaiement: 'global' }))).toBe('global');
  expect(societeModePaiement(societe({ modePaiement: 'partiel' }))).toBe('partiel');
  // Défaut : paiement partiel (assurance) pour une société sans mode explicite.
  expect(societeModePaiement(societe())).toBe('partiel');
  expect(societeModePaiement(undefined)).toBe('partiel');
});

test('une société est payeur global quand la base commune la déclare payeur', () => {
  const state = {
    companies: [{ id: 'soc-1', name: 'PAYEUR GLOBAL', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'payeur', tauxCouverture: 100 }],
    assuranceSocietes: [],
  } as unknown as AppState;
  expect(societeModePaiement(sharedSocietes(state)[0])).toBe('global');
});

test('exclure une famille d’articles bloque la prise en charge de l’acte', () => {
  const soc = societe({ exclusions: [familleEcho] });
  // Reconnue par le code famille…
  expect(exclusionActe(soc, { code: 'ECHO', libelle: 'Échographie pelvienne' })?.id).toBe('exc-1');
  // …et par un libellé d’acte (ex. « ÉCHOGRAPHIE », « LABORATOIRE »).
  expect(exclusionActe(soc, { code: 'AUTRE', libelle: 'Échographie abdominale' })?.id).toBe('exc-1');
  expect(exclusionActe(soc, { code: 'CONS', libelle: 'Consultation' })).toBeUndefined();

  const echo = repartirActe(soc, { totalPrestation: 30000, code: 'ECHO', libelle: 'Échographie pelvienne' });
  expect(echo).toMatchObject({ taux: 0, montantARembourser: 0, ticketModerateur: 30000, montantExclu: 24000, excluParSociete: true });
  expect(echo.motifExclusion).toContain('client comptoir');

  // Les autres actes gardent le taux contractuel de la société.
  const cons = repartirActe(soc, { totalPrestation: 20000, code: 'CONS', libelle: 'Consultation' });
  expect(cons).toMatchObject({ taux: 80, montantARembourser: 16000, ticketModerateur: 4000, montantExclu: 0, excluParSociete: false });
});

test('exclure un assuré bloque tous ses actes, la famille reste due en client comptoir', () => {
  const soc = societe({ exclusions: [exclusionAssure] });
  expect(exclusionPersonne(soc, { id: 'patient-1', nomPrenom: 'RAKOTO TEST' })?.id).toBe('exc-2');
  expect(exclusionPersonne(soc, { id: 'patient-2', nomPrenom: 'RAKOTO AUTRE' })).toBeUndefined();

  const repartition = repartirPrestation(
    soc,
    [
      { totalPrestation: 20000, code: 'CONS', libelle: 'Consultation' },
      { totalPrestation: 30000, code: 'LABO', libelle: 'Analyses' },
    ],
    { id: 'patient-1', nomPrenom: 'RAKOTO TEST', matricule: 'MAT-1' },
  );
  expect(repartition).toMatchObject({
    totalPrestation: 50000, montantARembourser: 0, ticketModerateur: 50000, montantExclu: 40000,
    nbActesExclus: 2, assureExclu: true,
  });
  expect(repartition.lignes[0].motifExclusion).toContain('Contrat résilié');
});

test('résumé des exclusions et règles désactivées', () => {
  const soc = societe({ exclusions: [familleEcho, exclusionAssure, { ...familleEcho, id: 'exc-3', actif: false }] });
  expect(resumerExclusions(soc)).toEqual({ total: 2, personnes: 1, familles: 1 });
});

test('les exclusions et le mode de règlement sont enregistrés dans la base commune', () => {
  const state = {
    companies: [{ id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit', settlementMode: 'per_invoice', type: 'assurance', tauxCouverture: 80 }],
    patients: [], familles: [], articles: [], invoices: [], ventes: [], ventePayments: [], companyBillingAccounts: [], cashClosings: [],
    assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [],
  } as unknown as AppState;

  const rows = sharedSocietes(state).map(s => ({ ...s, modePaiement: 'global' as const, exclusions: [familleEcho] }));
  const ecrit = writeSharedTable(state, 'assuranceSocietes', rows);
  // 'payeur' = Payeur global, 'assurance' = Paiement partiel.
  expect(ecrit.companies[0]).toMatchObject({ type: 'payeur' });
  expect(ecrit.assuranceSocietes?.[0]?.exclusions).toHaveLength(1);
  expect(societeModePaiement(sharedSocietes(ecrit)[0])).toBe('global');
  expect(sharedSocietes(ecrit)[0].exclusions?.[0]?.familleCode).toBe('ECHO');

  const reparti = writeSharedTable(ecrit, 'assuranceSocietes', sharedSocietes(ecrit).map(s => ({ ...s, modePaiement: 'partiel' as const })));
  expect(reparti.companies[0]).toMatchObject({ type: 'assurance' });
});

test('un acte exclu par la société ne crée aucune créance à recouvrer', () => {
  const prestation: Prestation = {
    id: 'prest-1', numeroFacture: 'FA-09/AC/26-001', date: '2026-09-10', societeId: 'soc-1', sousSociete: 'Siège',
    personneId: 'patient-1', totalPrestation: 30000, participation: 30000, montantARembourser: 0, statut: 'En attente',
    dateCreation: '2026-09-10',
    lignes: [{ id: 'ligne-1', prestationId: 'prest-1', code: 'ECHO', libelle: 'Échographie pelvienne', totalPrestation: 30000, ticketModerateur: 30000, montantARembourser: 0, totalPaye: 0, excluParSociete: true, motifExclusion: 'Acte exclu par la société' }],
  };
  const [recue] = reconcilePrestationsWithPaiements([prestation], []);
  expect(recue.statut).toBe('Rejeté');
  expect(recue.lignes[0].statut).toBe('Rejeté');
  expect(recue.resteAPayer).toBe(0);
});
