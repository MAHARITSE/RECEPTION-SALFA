import { expect, test } from '@playwright/test';
import type { Company, Invoice, Patient, TicketSettings } from '../src/types';
import type { AppState } from '../src/store';
import {
  NATURES_REMISE,
  companyNatureRemise,
  estRemiseReelle,
  invoiceNatureRemise,
  invoiceReductionLabel,
  libelleReductionCommun,
  libelleReductionCommunCourt,
  natureRemiseLabel,
  natureRemiseLabelCourt,
  natureRemiseOuDefaut,
} from '../src/utils/natureRemise';
import {
  estRemise,
  libelleReduction,
  natureRemiseEffective,
  natureRemisePour,
  societeNatureRemise,
} from '../src/modules/assurance/utils/natureRemise';
import { sharedPersonnes, sharedSocietes, writeSharedTable } from '../src/modules/assurance/sharedData';
import { salfaIndividualInvoiceHtml } from '../src/utils/printSalfaInvoice';
import type { Personne, Prestation, Societe } from '../src/modules/assurance/types';

/** Réglages d'impression minimaux : l'en-tête personnalisé reste désactivé. */
const settings = { currency: 'Ar', facilityName: 'SALFA' } as unknown as TicketSettings;

const societe = (overrides: Partial<Company> = {}): Company => ({
  id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit', settlementMode: 'per_invoice', ...overrides,
});

const ficheSociete = (overrides: Partial<Societe> = {}): Societe => ({
  id: 'soc-1', nom: 'ASSURANCE COMMUNE', code: 'AC', tauxCouvertureDefaut: 80, ...overrides,
});

const facture = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1', patientId: 'pat-1', clientType: 'societe', clientName: 'RAKOTO TEST',
  items: [{ description: 'Consultation', amount: 100000, category: 'consultation' } as Invoice['items'][number]],
  totalAmount: 100000, patientCharge: 80000, status: 'paid', createdAt: '2026-09-10T08:00:00.000Z',
  isExternal: false, numeroFacture: 'FA-09/AC/26-001', ...overrides,
});

test('la réduction est un ticket modérateur par défaut, une remise si la société le déclare', () => {
  // Deux natures proposées dans la gestion des sociétés, ticket modérateur en tête.
  expect(NATURES_REMISE.map(n => n.value)).toEqual(['ticket_moderateur', 'remise']);

  expect(natureRemiseOuDefaut(undefined)).toBe('ticket_moderateur');
  expect(natureRemiseOuDefaut('inconnu')).toBe('ticket_moderateur');
  expect(natureRemiseOuDefaut('remise')).toBe('remise');

  expect(natureRemiseLabel(undefined)).toBe('Ticket modérateur');
  expect(natureRemiseLabel('remise')).toBe('Remise');
  expect(natureRemiseLabelCourt(undefined)).toBe('Ticket mod.');
  expect(natureRemiseLabelCourt('remise')).toBe('Remise');

  expect(estRemiseReelle(undefined)).toBe(false);
  expect(estRemiseReelle('remise')).toBe(true);
  expect(companyNatureRemise(societe())).toBe('ticket_moderateur');
  expect(companyNatureRemise(societe({ natureRemise: 'remise' }))).toBe('remise');

  // Pièces mêlées : l'intitulé historique est conservé.
  expect(libelleReductionCommun(['remise', 'remise'])).toBe('Remise');
  expect(libelleReductionCommun([undefined, undefined])).toBe('Ticket modérateur');
  expect(libelleReductionCommun(['remise', undefined])).toBe('Remise/Participation');
  expect(libelleReductionCommunCourt(['remise', undefined])).toBe('Remise/Part.');
});

test('un assuré peut déroger au réglage de sa société', () => {
  const enRemise = ficheSociete({ natureRemise: 'remise' });
  const enTicket = ficheSociete();
  const assure = (overrides: Partial<Personne> = {}): Personne => ({
    id: 'pat-1', nomPrenom: 'RAKOTO TEST', matricule: 'MAT-1', societeId: 'soc-1', ...overrides,
  });

  // Sans dérogation, l'assuré suit sa société.
  expect(natureRemiseEffective(enTicket, assure())).toBe('ticket_moderateur');
  expect(natureRemiseEffective(enRemise, assure())).toBe('remise');
  expect(estRemise(enRemise, assure())).toBe(true);
  expect(libelleReduction(enRemise, assure())).toBe('Remise');

  // Dérogation individuelle dans les deux sens.
  expect(natureRemiseEffective(enTicket, assure({ natureRemise: 'remise' }))).toBe('remise');
  expect(natureRemiseEffective(enRemise, assure({ natureRemise: 'ticket_moderateur' }))).toBe('ticket_moderateur');
  expect(societeNatureRemise(enRemise)).toBe('remise');

  // Résolution par identifiants (vues qui ne manipulent que les listes).
  const societes = [enTicket, { ...enRemise, id: 'soc-2', nom: 'MUTUELLE REMISE' }];
  const personnes = [assure(), assure({ id: 'pat-2', societeId: 'soc-2' }), assure({ id: 'pat-3', societeId: 'soc-2', natureRemise: 'ticket_moderateur' })];
  expect(natureRemisePour(societes, personnes, 'soc-1', 'pat-1')).toBe('ticket_moderateur');
  expect(natureRemisePour(societes, personnes, 'soc-2', 'pat-2')).toBe('remise');
  expect(natureRemisePour(societes, personnes, 'soc-2', 'pat-3')).toBe('ticket_moderateur');
  expect(natureRemisePour(societes, personnes, 'soc-inconnue', undefined)).toBe('ticket_moderateur');
});

test('le réglage de la société est écrit dans la base commune et relu par le suivi', () => {
  const state = {
    companies: [societe({ type: 'assurance', tauxCouverture: 80 })],
    patients: [], familles: [], articles: [], invoices: [], ventes: [], ventePayments: [],
    companyBillingAccounts: [], cashClosings: [],
    assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [],
  } as unknown as AppState;

  const ecrit = writeSharedTable(state, 'assuranceSocietes', sharedSocietes(state).map(s => ({ ...s, natureRemise: 'remise' as const })));

  // Partagé avec la caisse / la facturation : la colonne imprimée suit.
  expect(ecrit.companies[0]).toMatchObject({ natureRemise: 'remise' });
  expect(ecrit.assuranceSocietes?.[0]).toMatchObject({ natureRemise: 'remise' });
  expect(societeNatureRemise(sharedSocietes(ecrit)[0])).toBe('remise');
  expect(estRemise(sharedSocietes(ecrit)[0])).toBe(true);

  // Retour au réglage par défaut.
  const retablie = writeSharedTable(ecrit, 'assuranceSocietes', sharedSocietes(ecrit).map(s => ({ ...s, natureRemise: 'ticket_moderateur' as const })));
  expect(retablie.companies[0]).toMatchObject({ natureRemise: 'ticket_moderateur' });
  expect(societeNatureRemise(sharedSocietes(retablie)[0])).toBe('ticket_moderateur');
});

test('la dérogation d’un assuré partagé est conservée dans les compléments assurance', () => {
  const patient: Patient = {
    id: 'pat-1', dossier: 'DOS-0001', lastName: 'RAKOTO', firstName: 'Test', company: 'ASSURANCE COMMUNE',
    clientType: 'societe', matricule: 'MAT-1',
  } as unknown as Patient;
  const state = {
    companies: [societe({ type: 'assurance' })],
    patients: [patient], familles: [], articles: [], invoices: [], ventes: [], ventePayments: [],
    companyBillingAccounts: [], cashClosings: [],
    assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [],
  } as unknown as AppState;

  const ecrit = writeSharedTable(state, 'assurancePersonnes', sharedPersonnes(state).map(p => ({ ...p, natureRemise: 'remise' as const })));

  // Le patient de Réception n'est pas modifié : la dérogation reste un complément assurance.
  expect((ecrit.patients[0] as unknown as { natureRemise?: string }).natureRemise).toBeUndefined();
  expect(ecrit.assurancePersonnes?.[0]).toMatchObject({ id: 'pat-1', natureRemise: 'remise' });
  const relue = sharedPersonnes(ecrit)[0];
  expect(natureRemiseEffective(sharedSocietes(ecrit)[0], relue)).toBe('remise');
});

test('la facture imprimée nomme la réduction selon la société et l’assuré', () => {
  const patient = { id: 'pat-1', lastName: 'RAKOTO', firstName: 'TEST', company: 'ASSURANCE COMMUNE' } as unknown as Patient;
  const inv = facture();

  // Aucune société connue : ticket modérateur (défaut historique).
  expect(salfaIndividualInvoiceHtml(settings, inv, patient)).toContain('Ticket modérateur');
  expect(salfaIndividualInvoiceHtml(settings, inv, patient)).not.toContain('Remise/Participat');

  // Société réglée en vraie remise.
  const htmlRemise = salfaIndividualInvoiceHtml(settings, inv, patient, societe({ natureRemise: 'remise' }));
  expect(htmlRemise).toContain('<td class="lbl">Remise</td>');
  expect(htmlRemise).not.toContain('Ticket modérateur');

  // Dérogation de l'assuré résolue par l'appelant (caisse).
  expect(salfaIndividualInvoiceHtml(settings, inv, patient, societe(), 'remise')).toContain('<td class="lbl">Remise</td>');
  expect(salfaIndividualInvoiceHtml(settings, inv, patient, societe({ natureRemise: 'remise' }), 'ticket_moderateur'))
    .toContain('Ticket modérateur');

  // Les montants ne bougent pas : brut, réduction et net restent identiques.
  for (const html of [
    salfaIndividualInvoiceHtml(settings, inv, patient, societe()),
    salfaIndividualInvoiceHtml(settings, inv, patient, societe({ natureRemise: 'remise' })),
  ]) {
    expect(html).toContain('100 000,00'); // total brut
    expect(html).toContain('20 000,00');  // réduction (brut − net)
    expect(html).toContain('80 000,00');  // net à payer
  }
});

test('la nature est résolue depuis la facture : assuré d’abord, société ensuite', () => {
  const base = {
    companies: [societe({ type: 'assurance' })],
    patients: [{ id: 'pat-1', lastName: 'RAKOTO', firstName: 'TEST', company: 'ASSURANCE COMMUNE', clientType: 'societe' }],
    familles: [], articles: [], invoices: [facture()], ventes: [], ventePayments: [],
    companyBillingAccounts: [], cashClosings: [],
    assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [], assurancePaiements: [],
  } as unknown as AppState;

  expect(invoiceNatureRemise(base, facture())).toBe('ticket_moderateur');
  expect(invoiceReductionLabel(base, facture())).toBe('Ticket modérateur');

  const enRemise = { ...base, companies: [societe({ type: 'assurance', natureRemise: 'remise' })] } as unknown as AppState;
  expect(invoiceNatureRemise(enRemise, facture())).toBe('remise');
  expect(invoiceReductionLabel(enRemise, facture())).toBe('Remise');

  // La dérogation de l'assuré l'emporte sur le réglage de la société.
  const derogation = {
    ...enRemise,
    assurancePersonnes: [{ id: 'pat-1', nomPrenom: 'RAKOTO TEST', matricule: 'MAT-1', societeId: 'soc-1', sharedPatient: true, natureRemise: 'ticket_moderateur' }],
  } as unknown as AppState;
  expect(invoiceNatureRemise(derogation, facture())).toBe('ticket_moderateur');

  // Une facture sans patient rattaché suit la société du client nommé.
  const sansPatient = facture({ patientId: undefined, clientName: 'ASSURANCE COMMUNE' });
  expect(invoiceNatureRemise(enRemise, sansPatient)).toBe('remise');
});

test('la nature d’une prescription est celle de sa société et de son assuré', () => {
  const prestation: Prestation = {
    id: 'pre-1', numeroFacture: 'FA-09/AC/26-001', date: '2026-09-10', societeId: 'soc-1', sousSociete: 'Direction',
    personneId: 'pat-1', totalPrestation: 100000, participation: 20000, ticketModerateur: 20000,
    montantARembourser: 80000, statut: 'En attente', lignes: [], dateCreation: '2026-09-10T08:00:00.000Z',
  };
  const societes = [ficheSociete(), ficheSociete({ id: 'soc-2', nom: 'MUTUELLE REMISE', natureRemise: 'remise' })];
  const personnes: Personne[] = [
    { id: 'pat-1', nomPrenom: 'RAKOTO TEST', matricule: 'MAT-1', societeId: 'soc-1' },
    { id: 'pat-2', nomPrenom: 'RASOA TEST', matricule: 'MAT-2', societeId: 'soc-2' },
    { id: 'pat-3', nomPrenom: 'ANDRIA TEST', matricule: 'MAT-3', societeId: 'soc-2', natureRemise: 'ticket_moderateur' },
  ];

  expect(natureRemisePour(societes, personnes, prestation.societeId, prestation.personneId)).toBe('ticket_moderateur');
  expect(natureRemisePour(societes, personnes, 'soc-2', 'pat-2')).toBe('remise');
  expect(natureRemisePour(societes, personnes, 'soc-2', 'pat-3')).toBe('ticket_moderateur');
  // Les montants de la prescription ne sont jamais recalculés par ce réglage.
  expect(prestation).toMatchObject({ totalPrestation: 100000, participation: 20000, montantARembourser: 80000 });
});
