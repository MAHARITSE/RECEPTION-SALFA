import type { NatureRemise } from '../../../types';
import type { Personne, Prestation, Societe } from '../types';
import {
  NATURE_REMISE_DEFAUT,
  natureRemiseLabel,
  natureRemiseLabelCourt,
  natureRemiseOuDefaut,
} from '../../../utils/natureRemise';

/**
 * NATURE DE LA RÉDUCTION — RÉSOLUTION SOCIÉTÉ + ASSURÉ
 * ----------------------------------------------------
 * La différence entre le total brut et le net d'une pièce prise en charge est,
 * par défaut, le TICKET MODÉRATEUR (quote-part de l'assuré). Certaines sociétés
 * accordent en réalité une VRAIE REMISE ; et à l'intérieur d'une même société,
 * certaines personnes seulement sont concernées.
 *
 * Règle de résolution (dans l'ordre) :
 *   1. la dérogation de l'assuré (`Personne.natureRemise`), si elle est renseignée ;
 *   2. le réglage de la société (`Societe.natureRemise` / `Company.natureRemise`) ;
 *   3. le défaut : ticket modérateur.
 *
 * Les montants ne sont jamais recalculés ici : seule la nature (donc le libellé
 * des factures, relevés et écrans) dépend de ce réglage.
 */

/** Nature enregistrée sur la société (défaut : ticket modérateur). */
export function societeNatureRemise(societe?: Partial<Societe> | null): NatureRemise {
  return natureRemiseOuDefaut(societe?.natureRemise);
}

/** Dérogation individuelle de l'assuré (`undefined` = il suit sa société). */
export function personneNatureRemise(personne?: Partial<Personne> | null): NatureRemise | undefined {
  return personne?.natureRemise === 'remise' || personne?.natureRemise === 'ticket_moderateur'
    ? personne.natureRemise
    : undefined;
}

/** Nature effective : dérogation de l'assuré, sinon réglage de la société. */
export function natureRemiseEffective(
  societe?: Partial<Societe> | null,
  personne?: Partial<Personne> | null,
): NatureRemise {
  return personneNatureRemise(personne) ?? societeNatureRemise(societe) ?? NATURE_REMISE_DEFAUT;
}

/** Vrai si la réduction est une vraie remise (ni due par l'assuré, ni par la société). */
export function estRemise(
  societe?: Partial<Societe> | null,
  personne?: Partial<Personne> | null,
): boolean {
  return natureRemiseEffective(societe, personne) === 'remise';
}

/** Libellé complet : « Ticket modérateur » ou « Remise ». */
export function libelleReduction(
  societe?: Partial<Societe> | null,
  personne?: Partial<Personne> | null,
): string {
  return natureRemiseLabel(natureRemiseEffective(societe, personne));
}

/** Libellé court pour les colonnes : « Ticket mod. » ou « Remise ». */
export function libelleReductionCourt(
  societe?: Partial<Societe> | null,
  personne?: Partial<Personne> | null,
): string {
  return natureRemiseLabelCourt(natureRemiseEffective(societe, personne));
}

/**
 * Résolution par identifiants, pour les vues qui ne manipulent que les listes
 * (sociétés / assurés) et un `societeId` + `personneId`.
 */
export function natureRemisePour(
  societes: Societe[] = [],
  personnes: Personne[] = [],
  societeId?: string | null,
  personneId?: string | null,
): NatureRemise {
  const societe = societeId ? societes.find(s => s.id === societeId) : undefined;
  const personne = personneId ? personnes.find(p => p.id === personneId) : undefined;
  return natureRemiseEffective(societe, personne);
}

/** Libellé de la réduction d'une prescription (société + assuré de la pièce). */
export function libelleReductionPrestation(
  societes: Societe[] = [],
  personnes: Personne[] = [],
  prestation?: Partial<Prestation> | null,
): string {
  if (!prestation) return natureRemiseLabel(NATURE_REMISE_DEFAUT);
  return libelleReduction(
    societes.find(s => s.id === prestation.societeId),
    personnes.find(p => p.id === prestation.personneId),
  );
}
