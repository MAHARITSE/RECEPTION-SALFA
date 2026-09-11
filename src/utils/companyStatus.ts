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

/** Option de liste déroulante (valeur, libellé, alerte éventuelle). */
export interface CompanyOption {
  value: string;
  label: string;
  hint?: string;
  /** Société en liste noire / suspendue : à afficher en rouge. */
  danger?: boolean;
}

/**
 * Sociétés proposées à la sélection.
 *
 * Une société bloquée n'est **jamais retirée** de la liste : elle reste
 * affichée, signalée en rouge, pour que l'opérateur voie immédiatement le
 * problème (impayé, suspension…). Le libellé rappelle le motif.
 */
export function companyOptions(companies: Company[] = [], at: Date = new Date()): CompanyOption[] {
  return (companies || [])
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))
    .map(c => {
      const bloquee = companyIsBlocked(c, at);
      return {
        value: c.name,
        label: bloquee ? `🚫 ${c.name} — ${companyBlockLabel(c, at)}` : c.name,
        hint: bloquee ? (c.blacklistReason || 'Société bloquée') : undefined,
        danger: bloquee,
      };
    });
}

/** Sous-sociétés / services connus pour une société (saisie assistée). */
export function subCompaniesOf(rows: { company?: string; subCompany?: string }[] = [], companyName?: string): string[] {
  const key = (companyName || '').trim().toUpperCase();
  if (!key) return [];
  const uniques = new Map<string, string>();
  for (const row of rows) {
    const societe = (row?.company || '').trim().toUpperCase();
    const sous = (row?.subCompany || '').trim();
    if (societe !== key || !sous) continue;
    const cle = sous.toUpperCase();
    if (!uniques.has(cle)) uniques.set(cle, sous);
  }
  return [...uniques.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}
