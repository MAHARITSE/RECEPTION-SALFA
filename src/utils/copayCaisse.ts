import type { AppState } from '../store';
import type { CopayTicketModerateur, InvoiceItem, NatureRemise, Patient } from '../types';
import type { Personne, Societe } from '../modules/assurance/types';
import { sharedPersonnes, sharedSocietes } from '../modules/assurance/sharedData';
import { natureRemiseEffective } from '../modules/assurance/utils/natureRemise';
import { repartirPrestation } from '../modules/assurance/utils/societeExclusions';

/**
 * TICKET MODÉRATEUR À LA CAISSE
 * -----------------------------
 * Un dossier pris en charge par une société n'est pas toujours intégralement
 * crédité à cette société : la différence entre le brut et le net est, PAR
 * DÉFAUT, le TICKET MODÉRATEUR (quote-part de l'assuré). Cette quote-part se
 * règle EN ESPÈCES à la caisse, au moment du paiement, et donne lieu à son
 * propre ticket.
 *
 * Ce module applique à la caisse EXACTEMENT la répartition contractuelle déjà
 * utilisée par la facturation société (`repartirPrestation`) : taux de
 * couverture de la société, puis exclusions d'assuré et de famille d'actes.
 * Aucune règle propre à la caisse n'est réinventée ici — les deux modules
 * affichent donc les mêmes montants.
 *
 * Cas particuliers :
 *  - la réduction est une VRAIE REMISE (`natureRemise: 'remise'`) : elle n'est
 *    due ni par l'assuré ni par la société → rien à encaisser (crédit intégral) ;
 *  - société inconnue / taux de couverture à 100 % → quote-part nulle ;
 *  - acte ou assuré EXCLU : la part bloquée s'ajoute à la quote-part, elle reste
 *    due par le patient (facturation en client comptoir).
 */

const arrondi2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Codes actes attendus par les exclusions « famille d'articles » (même table que la facturation société). */
const CODE_PAR_CATEGORIE: Record<InvoiceItem['category'], string> = {
  consultation: 'CONS', pharmacy: 'MEDIC', lab: 'LAB', echo: 'ECHO', surgery: 'HOSP', hospitalization: 'HOSP',
};

export interface RepartitionCopay {
  /** Total brut des lignes réparties. */
  brut: number;
  /** Part créditée à la société (montant à rembourser). */
  partSociete: number;
  /** Quote-part due par le patient : à encaisser en espèces si la nature est un ticket modérateur. */
  ticketModerateur: number;
  /** Part bloquée par une exclusion (assuré / famille d'actes), incluse dans la quote-part. */
  montantExclu: number;
  /** Taux de couverture contractuel de la société (0 à 100). */
  taux: number;
  /** Nature de la réduction : ticket modérateur (quote-part due) ou remise (rien à encaisser). */
  nature: NatureRemise;
  /** Vrai si un montant doit être encaissé en espèces à la caisse. */
  aEncaisser: boolean;
  /** Société appliquée (absente = client sans société connue). */
  societe?: Societe;
  /** Assuré appliqué (dérogation individuelle éventuelle). */
  personne?: Personne;
  /** Nombre d'actes totalement exclus par la société. */
  nbActesExclus: number;
}

const sansCopay = (params: { societe?: Societe | null; personne?: Personne | null; brut: number; nature: NatureRemise }): RepartitionCopay => ({
  brut: arrondi2(params.brut), partSociete: arrondi2(params.brut), ticketModerateur: 0, montantExclu: 0,
  taux: 100, nature: params.nature, aEncaisser: false,
  societe: params.societe || undefined, personne: params.personne || undefined, nbActesExclus: 0,
});

/** Base commune (sociétés + assurés) dérivée de la base Réception. */
export function baseCommuneCaisse(state: AppState): { societes: Societe[]; personnes: Personne[] } {
  return { societes: sharedSocietes(state), personnes: sharedPersonnes(state) };
}

/**
 * Société et assuré correspondant à un patient Réception, à partir de listes
 * déjà calculées (la dérivation de la base commune est coûteuse : elle est
 * mémorisée une fois par rendu côté caisse).
 */
export function societeEtPersonneParmi(
  patient?: Pick<Patient, 'id' | 'company' | 'clientType'> | null,
  societes: Societe[] = [],
  personnes: Personne[] = [],
): { societe?: Societe; personne?: Personne } {
  if (!patient || patient.clientType !== 'societe') return {};
  const nom = (patient.company || '').trim().toUpperCase();
  return {
    societe: societes.find(s => (s.nom || '').trim().toUpperCase() === nom),
    personne: personnes.find(p => p.id === patient.id),
  };
}

/** Société de la base commune et fiche assuré correspondant à un patient Réception. */
export function societeEtPersonneDuPatient(
  state: AppState,
  patient?: Pick<Patient, 'id' | 'company' | 'clientType'> | null,
): { societe?: Societe; personne?: Personne } {
  const { societes, personnes } = baseCommuneCaisse(state);
  return societeEtPersonneParmi(patient, societes, personnes);
}

/** Lignes de répartition (code acte + libellé + montant) à partir de lignes de facture caisse. */
export function lignesDepuisItems(items: InvoiceItem[] = []) {
  return (items || [])
    .filter(it => (Number(it.amount) || 0) > 0)
    .map(it => ({
      code: it.code || CODE_PAR_CATEGORIE[it.category] || 'CONS',
      libelle: it.description || '',
      totalPrestation: Math.max(0, Number(it.amount) || 0),
    }));
}

/**
 * Répartition d'un ensemble de lignes de facture caisse : part de la société et
 * quote-part du patient. La nature de la réduction est résolue comme partout
 * ailleurs (dérogation de l'assuré, sinon réglage de la société, sinon ticket
 * modérateur) ; une vraie remise ne donne rien à encaisser.
 */
export function repartirItemsCaisse(params: {
  societe?: Societe | null;
  personne?: Personne | null;
  items: InvoiceItem[];
}): RepartitionCopay {
  const items = params.items || [];
  const brut = arrondi2(items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
  const nature = natureRemiseEffective(params.societe, params.personne);
  // REMISE : réduction accordée, due ni par l'assuré ni par la société.
  if (nature === 'remise' || !params.societe) {
    return sansCopay({ societe: params.societe, personne: params.personne, brut, nature });
  }
  const repartition = repartirPrestation(params.societe, lignesDepuisItems(items), params.personne);
  const partSociete = arrondi2(repartition.montantARembourser);
  // Quote-part = brut − part de la société (tout ce qui n'est pas pris en charge
  // reste dû par le patient, exclusions comprises).
  const ticketModerateur = arrondi2(Math.max(0, brut - partSociete));
  const tauxContrat = Number(params.societe.tauxCouvertureDefaut);
  return {
    brut,
    partSociete,
    ticketModerateur,
    montantExclu: arrondi2(repartition.montantExclu),
    taux: Number.isFinite(tauxContrat) ? Math.max(0, Math.min(100, tauxContrat)) : 100,
    nature,
    aEncaisser: ticketModerateur > 0,
    societe: params.societe,
    personne: params.personne || undefined,
    nbActesExclus: repartition.nbActesExclus,
  };
}

/**
 * Répartition FACTURE PAR FACTURE d'un lot de caisse (factures services en
 * attente + facture médicaments) : chaque pièce créditée à la société porte son
 * propre net, la quote-part totale étant encaissée en une seule fois.
 */
export function repartirLotCaisse(params: {
  societe?: Societe | null;
  personne?: Personne | null;
  /** Factures du lot, dans l'ordre : `id` absent pour une facture pas encore créée. */
  factures: Array<{ id?: string; items: InvoiceItem[] }>;
}): { total: RepartitionCopay; parFacture: RepartitionCopay[] } {
  const parFacture = (params.factures || []).map(f =>
    repartirItemsCaisse({ societe: params.societe, personne: params.personne, items: f.items }));
  const somme = (clef: 'brut' | 'partSociete' | 'ticketModerateur' | 'montantExclu' | 'nbActesExclus') =>
    arrondi2(parFacture.reduce((s, r) => s + (r[clef] || 0), 0));
  const premiere = parFacture[0];
  const total: RepartitionCopay = premiere
    ? {
        ...premiere,
        brut: somme('brut'), partSociete: somme('partSociete'),
        ticketModerateur: somme('ticketModerateur'), montantExclu: somme('montantExclu'),
        nbActesExclus: somme('nbActesExclus'),
        aEncaisser: somme('ticketModerateur') > 0,
      }
    : sansCopay({ societe: params.societe, personne: params.personne, brut: 0, nature: natureRemiseEffective(params.societe, params.personne) });
  return { total, parFacture };
}

/** Métadonnées enregistrées sur les factures (crédit société + ticket espèces). */
export function copayMetadata(r: RepartitionCopay, extra?: {
  sourceInvoiceIds?: string[];
  numeroFactureSociete?: string;
}): CopayTicketModerateur {
  return {
    brut: r.brut, partSociete: r.partSociete, montant: r.ticketModerateur,
    natureRemise: r.nature, societeNom: r.societe?.nom, societeId: r.societe?.id,
    taux: r.taux, montantExclu: r.montantExclu,
    sourceInvoiceIds: extra?.sourceInvoiceIds, numeroFactureSociete: extra?.numeroFactureSociete,
  };
}

/** Libellé du règlement affiché sur le ticket d'espèces du ticket modérateur. */
export function copayLibelleReglement(r?: RepartitionCopay | null): string {
  return r && r.nature === 'remise' ? 'REMISE (rien à encaisser)' : 'ESPÈCES (ticket modérateur)';
}
