import { expect, test } from '@playwright/test';
import type { AppState } from '../src/store';
import type { InvoiceItem } from '../src/types';
import type { ExclusionSociete, Personne, Societe } from '../src/modules/assurance/types';
import {
  copayMetadata,
  lignesDepuisItems,
  repartirItemsCaisse,
  repartirLotCaisse,
  societeEtPersonneDuPatient,
} from '../src/utils/copayCaisse';

/**
 * TICKET MODÉRATEUR À LA CAISSE
 * La quote-part de l'assuré (brut − part prise en charge par la société) doit
 * être encaissée EN ESPÈCES au moment du paiement, puis donner lieu à un ticket.
 * Une vraie REMISE ne donne rien à encaisser. Les montants doivent être
 * identiques à ceux de la facturation société (même fonction de répartition).
 */

const societe = (over: Partial<Societe> = {}): Societe => ({
  id: 'soc-1', nom: 'CNAPS', code: 'CNP', tauxCouvertureDefaut: 80, ...over,
});
const personne = (over: Partial<Personne> = {}): Personne => ({
  id: 'pat-1', nomPrenom: 'RAKOTO Jean', matricule: 'M-1', societeId: 'soc-1', ...over,
});
const item = (description: string, amount: number, category: InvoiceItem['category']): InvoiceItem => ({
  description, amount, quantity: 1, unitPrice: amount, category,
});
const exclusion = (over: Partial<ExclusionSociete> = {}): ExclusionSociete => ({
  id: 'exc-1', type: 'famille', actif: true, ...over,
});

const CONSULTATION = item('Consultation spécialiste', 20_000, 'consultation');
const MEDICAMENTS = item('PARACETAMOL 500 mg', 50_000, 'pharmacy');
const ECHOGRAPHIE = item('Échographie pelvienne', 100_000, 'echo');

test('ticket modérateur par défaut : la quote-part de l’assuré est à encaisser', () => {
  const rep = repartirItemsCaisse({
    societe: societe(), personne: personne(), items: [CONSULTATION, MEDICAMENTS],
  });
  expect(rep.nature).toBe('ticket_moderateur');
  expect(rep.brut).toBe(70_000);
  // Taux contractuel 80 % → 56 000 Ar crédités à la société, 14 000 Ar en espèces.
  expect(rep.partSociete).toBe(56_000);
  expect(rep.ticketModerateur).toBe(14_000);
  expect(rep.aEncaisser).toBe(true);
  expect(rep.taux).toBe(80);
  // Invariant : rien ne disparaît entre la société et le patient.
  expect(rep.partSociete + rep.ticketModerateur).toBe(rep.brut);
});

test('prise en charge à 100 % ou société inconnue : rien à encaisser', () => {
  const total = repartirItemsCaisse({ societe: societe({ tauxCouvertureDefaut: 100 }), personne: personne(), items: [MEDICAMENTS] });
  expect(total.ticketModerateur).toBe(0);
  expect(total.partSociete).toBe(total.brut);
  expect(total.aEncaisser).toBe(false);

  const sansSociete = repartirItemsCaisse({ societe: undefined, personne: undefined, items: [MEDICAMENTS] });
  expect(sansSociete.aEncaisser).toBe(false);
  expect(sansSociete.partSociete).toBe(sansSociete.brut);
});

test('remise (société) : la réduction n’est due par personne, aucun encaissement', () => {
  const rep = repartirItemsCaisse({
    societe: societe({ natureRemise: 'remise' }), personne: personne(), items: [CONSULTATION, MEDICAMENTS],
  });
  expect(rep.nature).toBe('remise');
  expect(rep.ticketModerateur).toBe(0);
  expect(rep.aEncaisser).toBe(false);
  // Crédit société intégral : comportement historique conservé.
  expect(rep.partSociete).toBe(rep.brut);
});

test('dérogation par assuré : la nature de la personne l’emporte sur celle de la société', () => {
  // Société en remise, assuré en ticket modérateur → quote-part encaissée.
  const due = repartirItemsCaisse({
    societe: societe({ natureRemise: 'remise' }),
    personne: personne({ natureRemise: 'ticket_moderateur' }),
    items: [MEDICAMENTS],
  });
  expect(due.nature).toBe('ticket_moderateur');
  expect(due.ticketModerateur).toBe(10_000);
  expect(due.aEncaisser).toBe(true);

  // Société en ticket modérateur, assuré en remise → rien à encaisser.
  const remise = repartirItemsCaisse({
    societe: societe(), personne: personne({ natureRemise: 'remise' }), items: [MEDICAMENTS],
  });
  expect(remise.nature).toBe('remise');
  expect(remise.ticketModerateur).toBe(0);
  expect(remise.aEncaisser).toBe(false);
});

test('acte exclu : la part bloquée reste due par le patient, en espèces', () => {
  const rep = repartirItemsCaisse({
    societe: societe({ exclusions: [exclusion({ familleCode: 'ECHO', motif: 'Hors contrat' })] }),
    personne: personne(),
    items: [ECHOGRAPHIE, CONSULTATION],
  });
  expect(rep.brut).toBe(120_000);
  // Échographie non prise en charge (0 Ar société) ; consultation à 80 %.
  expect(rep.partSociete).toBe(16_000);
  expect(rep.ticketModerateur).toBe(104_000);
  expect(rep.montantExclu).toBe(80_000);
  expect(rep.nbActesExclus).toBe(1);
  expect(rep.aEncaisser).toBe(true);
});

test('assuré exclu : toute la facture est encaissée auprès du patient', () => {
  const rep = repartirItemsCaisse({
    societe: societe({ exclusions: [exclusion({ type: 'personne', personneId: 'pat-1', tauxPriseEnCharge: 0 })] }),
    personne: personne(),
    items: [CONSULTATION, MEDICAMENTS],
  });
  expect(rep.partSociete).toBe(0);
  expect(rep.ticketModerateur).toBe(rep.brut);
  expect(rep.aEncaisser).toBe(true);
});

test('exclusion désactivée et taux résiduel sont respectés', () => {
  const inactive = repartirItemsCaisse({
    societe: societe({ exclusions: [exclusion({ familleCode: 'ECHO', actif: false })] }),
    personne: personne(), items: [ECHOGRAPHIE],
  });
  expect(inactive.partSociete).toBe(80_000);
  expect(inactive.ticketModerateur).toBe(20_000);

  const residuel = repartirItemsCaisse({
    societe: societe({ exclusions: [exclusion({ familleCode: 'ECHO', tauxPriseEnCharge: 50 })] }),
    personne: personne(), items: [ECHOGRAPHIE],
  });
  expect(residuel.partSociete).toBe(50_000);
  expect(residuel.ticketModerateur).toBe(50_000);
  expect(residuel.montantExclu).toBe(30_000);
});

test('répartition facture par facture : services puis médicaments', () => {
  const lot = repartirLotCaisse({
    societe: societe(), personne: personne(),
    factures: [
      { id: 'inv-labo', items: [item('Analyse NFS', 30_000, 'lab')] },
      { id: 'inv-echo', items: [ECHOGRAPHIE] },
      { id: undefined, items: [MEDICAMENTS] },
    ],
  });
  expect(lot.parFacture).toHaveLength(3);
  expect(lot.parFacture.map(r => r.partSociete)).toEqual([24_000, 80_000, 40_000]);
  expect(lot.parFacture.map(r => r.ticketModerateur)).toEqual([6_000, 20_000, 10_000]);
  // Le total encaissé en espèces = somme des quotes-parts (une seule facture espèces).
  expect(lot.total.brut).toBe(180_000);
  expect(lot.total.partSociete).toBe(144_000);
  expect(lot.total.ticketModerateur).toBe(36_000);
  expect(lot.total.aEncaisser).toBe(true);
});

test('lot vide ou sans quote-part : aucune facture d’espèces', () => {
  const vide = repartirLotCaisse({ societe: societe(), personne: personne(), factures: [] });
  expect(vide.total.aEncaisser).toBe(false);
  expect(vide.total.brut).toBe(0);

  const remise = repartirLotCaisse({
    societe: societe({ natureRemise: 'remise' }), personne: personne(),
    factures: [{ id: 'inv-1', items: [CONSULTATION] }],
  });
  expect(remise.total.aEncaisser).toBe(false);
  expect(remise.total.ticketModerateur).toBe(0);
});

test('lignes de répartition : codes actes et libellés issus des lignes de facture', () => {
  expect(lignesDepuisItems([CONSULTATION, MEDICAMENTS, ECHOGRAPHIE, item('Soin', 5_000, 'surgery')]))
    .toEqual([
      { code: 'CONS', libelle: 'Consultation spécialiste', totalPrestation: 20_000 },
      { code: 'MEDIC', libelle: 'PARACETAMOL 500 mg', totalPrestation: 50_000 },
      { code: 'ECHO', libelle: 'Échographie pelvienne', totalPrestation: 100_000 },
      { code: 'HOSP', libelle: 'Soin', totalPrestation: 5_000 },
    ]);
  // Les lignes nulles ne participent pas à la répartition.
  expect(lignesDepuisItems([item('Gratuit', 0, 'consultation')])).toEqual([]);
});

test('métadonnées enregistrées sur les factures (crédit société + espèces)', () => {
  const rep = repartirItemsCaisse({ societe: societe(), personne: personne(), items: [CONSULTATION, MEDICAMENTS] });
  const meta = copayMetadata(rep, { sourceInvoiceIds: ['inv-1', 'inv-2'], numeroFactureSociete: 'FA-09/CNP/26-001' });
  expect(meta).toEqual({
    brut: 70_000, partSociete: 56_000, montant: 14_000,
    natureRemise: 'ticket_moderateur', societeNom: 'CNAPS', societeId: 'soc-1',
    taux: 80, montantExclu: 0,
    sourceInvoiceIds: ['inv-1', 'inv-2'], numeroFactureSociete: 'FA-09/CNP/26-001',
  });
});

test('résolution société + assuré depuis un patient Réception', () => {
  const state = {
    companies: [{ id: 'soc-1', name: 'CNAPS', tauxCouverture: 80, type: 'assurance' }],
    patients: [
      { id: 'pat-1', lastName: 'RAKOTO', firstName: 'Jean', clientType: 'societe', company: 'cnaps' },
      { id: 'pat-2', lastName: 'RASOA', firstName: 'Marie', clientType: 'comptoir' },
    ],
    assuranceSocietes: [{ id: 'soc-1', nom: 'CNAPS', code: 'CNP', tauxCouvertureDefaut: 80, exclusions: [] }],
    assurancePersonnes: [{ id: 'pat-1', nomPrenom: 'RAKOTO Jean', matricule: 'M-1', societeId: 'soc-1', natureRemise: 'remise' }],
  } as unknown as AppState;

  const { societe: soc, personne: pers } = societeEtPersonneDuPatient(state, state.patients[0]);
  expect(soc?.id).toBe('soc-1');
  // Le nom est apparié sans tenir compte de la casse.
  expect(soc?.nom).toBe('CNAPS');
  expect(soc?.tauxCouvertureDefaut).toBe(80);
  // La dérogation de l'assuré est bien reprise.
  expect(pers?.natureRemise).toBe('remise');
  expect(
    repartirItemsCaisse({ societe: soc, personne: pers, items: [MEDICAMENTS] }).aEncaisser,
  ).toBe(false);

  // Client comptoir : aucune société, donc aucune quote-part.
  expect(societeEtPersonneDuPatient(state, state.patients[1])).toEqual({});
  expect(societeEtPersonneDuPatient(state, null)).toEqual({});
});

test('une société en ticket modérateur sans taux renseigné prend tout en charge', () => {
  // `sharedSocietes` renseigne toujours un taux (100 % par défaut) : sans taux
  // contractuel inférieur à 100 %, la caisse n'a rien à encaisser.
  const rep = repartirItemsCaisse({ societe: societe({ tauxCouvertureDefaut: 100 }), personne: personne(), items: [ECHOGRAPHIE] });
  expect(rep.ticketModerateur).toBe(0);
  expect(rep.aEncaisser).toBe(false);
});
