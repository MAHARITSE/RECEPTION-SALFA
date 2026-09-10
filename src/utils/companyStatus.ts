import type { Company } from '../types';

/**
 * LISTE NOIRE DES SOCIÉTÉS
 * ------------------------
 * Une société bloquée ne doit plus ouvrir de consultation ni de prise en charge
 * à ses frais : impayé, suspension temporaire de la convention, contentieux…
 * Le blocage est porté par les champs `blacklisted`, `blacklistReason`,
 * `blacklistDate` et `blacklistUntil` (fin de suspension, facultative).
 *
 * Ce module est volontairement autonome (aucune dépendance aux données locales)
 * pour être utilisé et testé partout : Réception, Caisse, Labo, suivi assurance.
 */

/** Date du jour au format ISO « AAAA-MM-JJ » (référence des suspensions). */
export function todayIsoDate(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Vrai si la suspension est terminée (date de fin dépassée). */
export function companySuspensionExpired(c?: Partial<Company> | null, at: Date = new Date()): boolean {
  if (!c?.blacklisted || !c.blacklistUntil) return false;
  return c.blacklistUntil < todayIsoDate(at);
}

/**
 * Société en liste noire : aucune consultation ni prise en charge ne doit être
 * ouverte à ses frais. Une suspension arrivée à échéance est levée d'elle-même.
 */
export function companyIsBlocked(c?: Partial<Company> | null, at: Date = new Date()): boolean {
  return Boolean(c?.blacklisted) && !companySuspensionExpired(c, at);
}

/** Libellé du blocage (« Liste noire » ou « Suspendue jusqu'au … »). */
export function companyBlockLabel(c?: Partial<Company> | null, at: Date = new Date()): string {
  if (!companyIsBlocked(c, at)) return '';
  if (c?.blacklistUntil) {
    const [y, m, d] = c.blacklistUntil.split('-');
    return `Suspendue jusqu'au ${d}/${m}/${y}`;
  }
  return 'Liste noire';
}

/** Classes Tailwind du badge de liste noire. */
export function companyBlockBadge(c?: Partial<Company> | null, at: Date = new Date()): string {
  if (!companyIsBlocked(c, at)) return '';
  return c?.blacklistUntil
    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
    : 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-500/30';
}

/** Recherche une société par son nom (liste noire, sélection en caisse…). */
export function findCompanyByName(companies: Company[] = [], name?: string): Company | undefined {
  const key = (name || '').trim().toUpperCase();
  if (!key) return undefined;
  return companies.find(c => (c.name || '').trim().toUpperCase() === key);
}

/** Société bloquée d'après son nom (vue Réception / Caisse / Labo). */
export function companyNameIsBlocked(companies: Company[] = [], name?: string, at: Date = new Date()): boolean {
  return companyIsBlocked(findCompanyByName(companies, name), at);
}

/**
 * Sociétés proposées à la sélection : les sociétés bloquées sont retirées, sauf
 * celle déjà enregistrée sur la fiche en cours (jamais modifiée en silence).
 */
export function selectableCompanies(companies: Company[] = [], keepName?: string, at: Date = new Date()): Company[] {
  return (companies || []).filter(c => !companyIsBlocked(c, at) || (!!keepName && c.name === keepName));
}
