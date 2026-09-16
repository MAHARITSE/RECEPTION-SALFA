import type { Invoice, NatureRemise } from '../types';
import type { AppState } from '../store';
import { findCompanyByName } from './companyStatus';

/**
 * NATURE DE LA RÉDUCTION (TOTAL BRUT − NET)
 * -----------------------------------------
 * Sur une pièce prise en charge par une société, la différence entre le total
 * brut et le net est, PAR DÉFAUT, le TICKET MODÉRATEUR : la quote-part qui
 * reste à la charge de l'assuré.
 *
 * Pour certaines sociétés — et pour certains assurés précis — cette différence
 * est une VRAIE REMISE : une réduction de prix accordée, que personne ne doit
 * (ni l'assuré, ni la société). Les montants ne changent pas : c'est la nature,
 * donc le libellé porté sur les factures, relevés et écrans, qui change.
 *
 * Ce module est volontairement autonome (aucune dépendance aux données locales)
 * pour être utilisé et testé partout : Réception, Caisse, Facturation, suivi
 * assurance. La résolution société + dérogation par assuré se trouve dans
 * `src/modules/assurance/utils/natureRemise.ts`.
 */

/** Nature appliquée quand rien n'est enregistré : le ticket modérateur. */
export const NATURE_REMISE_DEFAUT: NatureRemise = 'ticket_moderateur';

export interface NatureRemiseOption {
  value: NatureRemise;
  label: string;
  /** Libellé court : colonnes de tableaux et lignes de facture imprimée. */
  court: string;
  description: string;
}

/** Choix proposés dans la gestion des sociétés (et des assurés). */
export const NATURES_REMISE: NatureRemiseOption[] = [
  {
    value: 'ticket_moderateur',
    label: 'Ticket modérateur',
    court: 'Ticket mod.',
    description:
      'Par défaut : la différence entre le total brut et le net reste à la charge de l’assuré (quote-part / participation).',
  },
  {
    value: 'remise',
    label: 'Remise',
    court: 'Remise',
    description:
      'Vraie remise accordée sur le prix : elle n’est due ni par l’assuré, ni par la société (réduction définitive du montant facturé).',
  },
];

/** Toute valeur absente ou inconnue retombe sur le défaut (ticket modérateur). */
export function natureRemiseOuDefaut(value?: string | null): NatureRemise {
  return value === 'remise' ? 'remise' : NATURE_REMISE_DEFAUT;
}

function option(value?: string | null): NatureRemiseOption {
  const nature = natureRemiseOuDefaut(value);
  return NATURES_REMISE.find(o => o.value === nature) || NATURES_REMISE[0];
}

/** Libellé complet : « Ticket modérateur » ou « Remise ». */
export function natureRemiseLabel(value?: string | null): string {
  return option(value).label;
}

/** Libellé court pour les colonnes : « Ticket mod. » ou « Remise ». */
export function natureRemiseLabelCourt(value?: string | null): string {
  return option(value).court;
}

/** Explication affichée sous le choix (aide à la saisie, infobulle). */
export function natureRemiseDescription(value?: string | null): string {
  return option(value).description;
}

/** Vrai si la réduction est une vraie remise (et non un ticket modérateur). */
export function estRemiseReelle(value?: string | null): boolean {
  return natureRemiseOuDefaut(value) === 'remise';
}

/** Nature de la réduction portée par une société de la base commune. */
export function companyNatureRemise(c?: { natureRemise?: string | null } | null): NatureRemise {
  return natureRemiseOuDefaut(c?.natureRemise);
}

/** Classes Tailwind du badge de nature (visible seulement pour une remise). */
export function natureRemiseBadge(value?: string | null): string {
  return estRemiseReelle(value)
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30';
}

/**
 * Libellé de la ligne « total brut − net » d'une facture imprimée.
 * La ligne reste toujours présente ; seul son intitulé suit la nature choisie.
 */
export function libelleLigneReduction(value?: string | null): string {
  return natureRemiseLabel(value);
}

/**
 * Nature commune à plusieurs pièces (relevé mensuel, facture fusionnée) :
 *  - toutes en remise            → « Remise » ;
 *  - toutes en ticket modérateur → « Ticket modérateur » ;
 *  - mélange                     → libellé historique « Remise/Participation ».
 */
/** Libellé COURT commun à plusieurs pièces (« Ticket mod. » / « Remise »). */
export function libelleReductionCommunCourt(values: Array<string | null | undefined>): string {
  const natures = new Set(values.map(v => natureRemiseOuDefaut(v)));
  if (natures.size === 1) return natureRemiseLabelCourt([...natures][0]);
  return 'Remise/Part.';
}

export function libelleReductionCommun(values: Array<string | null | undefined>): string {
  const natures = new Set(values.map(v => natureRemiseOuDefaut(v)));
  if (natures.size === 1) return natureRemiseLabel([...natures][0]);
  return 'Remise/Participation';
}

/* ====== RÉSOLUTION PAR FACTURE (CAISSE) ====== */

/**
 * Nature de la réduction (total brut − net) d'une facture de la caisse :
 *  1. dérogation individuelle de l'assuré (fiche assuré du suivi assurance) ;
 *  2. réglage de la société (gestion des sociétés) ;
 *  3. défaut : TICKET MODÉRATEUR.
 */
export function invoiceNatureRemise(state: AppState, invoice: Invoice): NatureRemise {
  const derogation = (state.assurancePersonnes || []).find(p => p.id === invoice.patientId)?.natureRemise;
  if (derogation) return natureRemiseOuDefaut(derogation);
  const patient = invoice.patientId ? (state.patients || []).find(p => p.id === invoice.patientId) : undefined;
  const company = findCompanyByName(state.companies || [], patient?.company || invoice.clientName);
  return companyNatureRemise(company);
}

/** Libellé de la ligne « brut − net » d'une facture : « Ticket modérateur » ou « Remise ». */
export function invoiceReductionLabel(state: AppState, invoice: Invoice): string {
  return natureRemiseLabel(invoiceNatureRemise(state, invoice));
}
