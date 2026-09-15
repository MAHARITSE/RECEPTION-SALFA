import { roundTo2 } from '../store';
import type { HbLine, HbRecord } from '../types';

/**
 * Montants d'un dossier d'hospitalisation ou de bloc opératoire.
 *
 * Ces calculs vivent ici (et non dans un module) parce que la même ardoise est
 * lue par la Caisse (saisie, encaissements, sortie), par la Pharmacie de garde
 * (encaissements) et par la Facturation (relance des reliquats après sortie) :
 * une seule règle de trois, sinon « le total de la caisse » et « le total du
 * facturier » finissent par différer — et ce sont les patients qui trinquent.
 *
 * RÈGLES (identiques à celles de la Caisse) :
 *  - une ligne = prix unitaire × quantité, remise en pourcentage ;
 *  - un dossier est « soldé » quand la somme des paiements atteint la facture ;
 *  - un solde NÉGATIF = trop-perçu (à rembourser ou à reporter), jamais masqué.
 */

/** Montant d'une ligne du dossier (remise incluse), arrondi au centime. */
export const hbLineAmt = (line: HbLine): number =>
  roundTo2((line.unitPrice || 0) * (line.quantity || 0) * (1 - (line.discount || 0) / 100));

/** Total facturé par le centre (toutes lignes validées confondues). */
export const hbTotalFacture = (record: HbRecord | undefined | null): number =>
  roundTo2((record?.lines || []).reduce((somme, l) => somme + hbLineAmt(l), 0));

/** Total déjà encaissé (caisse ou pharmacie de garde). */
export const hbTotalPaye = (record: HbRecord | undefined | null): number =>
  roundTo2((record?.payments || []).reduce((somme, p) => somme + (p.amount || 0), 0));

/** Ce qui reste dû au centre (négatif = trop-perçu du patient). */
export const hbReste = (record: HbRecord | undefined | null): number =>
  roundTo2(hbTotalFacture(record) - hbTotalPaye(record));

/** Vrai si le dossier a reçu une autorisation de sortie (dossier clos côté Caisse). */
export const hbEstSorti = (record: HbRecord | undefined | null): boolean => !!record?.dischargedAt;

/** Vrai si le patient est sorti ALORS QU'il restait de l'argent au centre :
 *  c'est exactement la liste que la Facturation doit suivre. */
export const hbReliquatApresSortie = (record: HbRecord | undefined | null): boolean =>
  hbEstSorti(record) && hbReste(record) > 0;

/** Jours écoulés depuis l'autorisation de sortie (0 aujourd'hui, -1 si jamais sorti). */
export const hbJoursDepuisSortie = (record: HbRecord | undefined | null, reference: Date = new Date()): number => {
  const brut = record?.dischargedAt;
  if (!brut) return -1;
  const t = new Date(brut).getTime();
  if (!Number.isFinite(t)) return -1;
  return Math.max(0, Math.floor((reference.getTime() - t) / 86400000));
};

/** Dernier encaissement (pour savoir si le dossier bouge encore). */
export const hbDernierPaiement = (record: HbRecord | undefined | null): { date: string; amount: number; recuPar: string } | null => {
  const paiements = record?.payments || [];
  if (!paiements.length) return null;
  const dernier = paiements.reduce((best, p) => (new Date(p.date).getTime() > new Date(best.date).getTime() ? p : best), paiements[0]);
  return { date: dernier.date, amount: roundTo2(dernier.amount || 0), recuPar: dernier.paidBy || (dernier.receivedBy === 'pharmacie' ? 'pharmacie de garde' : 'caisse') };
};

/** Libellé humain du type de dossier. */
export const hbTypeLabel = (type: HbRecord['type'] | undefined): string =>
  type === 'bloc' ? 'Bloc opératoire' : 'Hospitalisation';

/** Un dossier n'est relançable que s'il est sorti, impayé et non soldé. */
export const hbReliquats = (records: HbRecord[] | undefined | null): HbRecord[] =>
  (records || []).filter(hbReliquatApresSortie);
