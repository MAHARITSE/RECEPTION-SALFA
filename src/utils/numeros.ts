import { IS_WAMP_BUILD, allocateWampSequences } from '../wamp';
import { allocateBrowserSequences, type SequenceRequest } from '../browserDb';
import {
  factureDateParts, formatDailyFactureNumber, formatSocieteFactureNumber,
} from './factureNumber';

/**
 * NUMÉROTATION OFFICIELLE DES FACTURES — ALLOCATION ATOMIQUE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant : chaque facture calculait son numéro en balayant TOUT l'historique
 * (O(n), de plus en plus lent) puis ajoutait +1 — deux caisses (ou deux
 * onglets) facturant en même temps obtenaient le MÊME numéro.
 *
 * Maintenant : le compteur de chaque période vit DANS le stockage, et
 * l'incrément s'y fait de façon atomique (transaction IndexedDB / MySQL
 * `SELECT … FOR UPDATE`). Un lot (une caisse qui solde 5 factures d'un coup)
 * est réservé en UNE seule opération : les numéros sont uniques, contigus
 * dans le lot, sans balayage.
 *
 * En cas d'échec (base injoignable…), CETTE FONCTION JETTE UNE ERREUR :
 * l'appelant doit alerter et NE JAMAIS facturer sans numéro réservé.
 * (Un numéro « deviné » en local serait un doublon garanti.)
 */

export interface DemandeNumero {
  kind: 'standard' | 'societe';
  /** Standard : date de la facture. Société : date des prescriptions (le mois compte). */
  date: Date;
  /** Société uniquement : code / diminutif (ex: JIRAMA). */
  code?: string;
}

/** Période du compteur : AAMMJJ (standard) ou AAMM (société). */
function periodeDe(demande: DemandeNumero): string {
  const p = factureDateParts(demande.date);
  return demande.kind === 'standard' ? `${p.yy}${p.mm}${p.dd}` : `${p.yy}${p.mm}`;
}

function requetesDe(demandes: DemandeNumero[]): SequenceRequest[] {
  return demandes.map((d) => ({ kind: d.kind, period: periodeDe(d), date: d.date, code: d.code }));
}

/**
 * Réserve `demandes.length` numéros de facture officiels, uniques et
 * définitifs. `seedNumbers` (historique des numéros existants) ne sert qu'à
 * amorcer une période inédite ; ensuite, simple incrément O(1).
 */
export async function attribuerNumerosFacture(demandes: DemandeNumero[], seedNumbers: string[]): Promise<string[]> {
  if (demandes.length === 0) return [];
  const seqs = IS_WAMP_BUILD
    ? await allocateWampSequences(requetesDe(demandes), seedNumbers)
    : await allocateBrowserSequences(requetesDe(demandes), seedNumbers);
  return demandes.map((d, i) => (d.kind === 'standard'
    ? formatDailyFactureNumber(d.date, seqs[i])
    : formatSocieteFactureNumber(d.date, d.code || 'SOC', seqs[i])));
}

/** Réserve UN seul numéro de facture officiel (cas courant). */
export async function attribuerNumeroFacture(demande: DemandeNumero, seedNumbers: string[]): Promise<string> {
  const [numero] = await attribuerNumerosFacture([demande], seedNumbers);
  return numero;
}
