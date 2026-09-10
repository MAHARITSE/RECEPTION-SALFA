import { expect, test } from '@playwright/test';
import type { Company } from '../src/types';
import type { AppState } from '../src/store';
import {
  companyBlockLabel,
  companyIsBlocked,
  companyNameIsBlocked,
  companySuspensionExpired,
  selectableCompanies,
} from '../src/utils/companyStatus';
import { sharedSocietes, writeSharedTable } from '../src/modules/assurance/sharedData';

const societe = (overrides: Partial<Company> = {}): Company => ({
  id: 'soc-1', name: 'JIRAMA', paymentMode: 'Crédit', settlementMode: 'per_invoice', ...overrides,
});

const le = (iso: string) => new Date(`${iso}T10:00:00`);

test('liste noire : blocage, motif et suspension temporaire', () => {
  expect(companyIsBlocked(societe())).toBe(false);
  expect(companyIsBlocked(societe({ blacklisted: true }))).toBe(true);
  expect(companyBlockLabel(societe({ blacklisted: true }))).toBe('Liste noire');

  // Suspension en cours : la société reste bloquée...
  const suspendue = societe({ blacklisted: true, blacklistUntil: '2026-09-30', blacklistReason: 'Impayé' });
  expect(companyIsBlocked(suspendue, le('2026-09-10'))).toBe(true);
  expect(companyBlockLabel(suspendue, le('2026-09-10'))).toBe("Suspendue jusqu'au 30/09/2026");
  // ...et redevient active toute seule après la date de fin.
  expect(companyIsBlocked(suspendue, le('2026-10-01'))).toBe(false);
  expect(companySuspensionExpired(suspendue, le('2026-10-01'))).toBe(true);
  expect(companyBlockLabel(suspendue, le('2026-10-01'))).toBe('');
});

test('les sociétés bloquées ne sont plus proposées à la sélection', () => {
  const companies = [
    societe({ id: 'soc-1', name: 'JIRAMA' }),
    societe({ id: 'soc-2', name: 'TELMA', blacklisted: true, blacklistReason: 'Impayé' }),
    societe({ id: 'soc-3', name: 'AXIAN' }),
  ];
  expect(selectableCompanies(companies).map(c => c.name)).toEqual(['JIRAMA', 'AXIAN']);
  // Une fiche déjà enregistrée sur une société bloquée n'est jamais modifiée en silence.
  expect(selectableCompanies(companies, 'TELMA').map(c => c.name)).toEqual(['JIRAMA', 'TELMA', 'AXIAN']);
  expect(companyNameIsBlocked(companies, 'TELMA')).toBe(true);
  expect(companyNameIsBlocked(companies, 'telma')).toBe(true);
  expect(companyNameIsBlocked(companies, 'JIRAMA')).toBe(false);
  expect(companyNameIsBlocked(companies, undefined)).toBe(false);
});

test('le blocage est enregistré dans la base commune et relu par le suivi assurance', () => {
  const state = {
    companies: [societe({ type: 'assurance', tauxCouverture: 80 })],
    patients: [], familles: [], articles: [], invoices: [], ventes: [], ventePayments: [],
    companyBillingAccounts: [], cashClosings: [],
    assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [],
  } as unknown as AppState;

  const rows = sharedSocietes(state).map(s => ({
    ...s, blacklisted: true, blacklistReason: 'Impayé de 3 mois', blacklistUntil: '2026-12-31',
  }));
  const ecrit = writeSharedTable(state, 'assuranceSocietes', rows);

  expect(ecrit.companies[0]).toMatchObject({
    blacklisted: true, blacklistReason: 'Impayé de 3 mois', blacklistUntil: '2026-12-31',
  });
  const relue = sharedSocietes(ecrit)[0];
  expect(companyIsBlocked(relue, le('2026-09-10'))).toBe(true);
  expect(companyBlockLabel(relue, le('2026-09-10'))).toBe("Suspendue jusqu'au 31/12/2026");

  // Rétablissement : retour à la liste normale.
  const retablie = writeSharedTable(ecrit, 'assuranceSocietes', sharedSocietes(ecrit).map(s => ({
    ...s, blacklisted: false, blacklistReason: undefined, blacklistUntil: undefined,
  })));
  expect(companyIsBlocked(sharedSocietes(retablie)[0], le('2026-09-10'))).toBe(false);
});
