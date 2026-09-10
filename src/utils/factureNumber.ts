/**
 * Numérotation officielle des factures — Caisse & partie Facturation.
 *
 * FORMAT STANDARD (comptoir / externes) — exemple : 26FA0427102
 *   26   → année (2 derniers chiffres)
 *   FA   → diminutif de « facture »
 *   04   → mois
 *   27   → jour
 *   102  → numéro d'ordre du jour (compteur quotidien, remis à 1 chaque jour)
 *
 * FORMAT SOCIÉTÉS — exemple : FA-07/BSA/26-014
 *   FA   → diminutif de « facture »
 *   07   → mois des prescriptions (prise en charge)
 *   BSA  → code société (diminutif) — généré puis enregistré dans la société s'il n'existe pas
 *   26   → année
 *   014  → ordre d'établissement de la facture (par société / mois / année des prescriptions)
 *
 * Les compteurs sont déduits des numéros déjà émis : renuméroter ou supprimer
 * une facture ne réutilise jamais un numéro déjà attribué.
 */

/** Numéro standard : 2 chiffres année + FA + 2 chiffres mois + 2 chiffres jour + ordre du jour. */
export const DAILY_FACTURE_RE = /^(\d{2})FA(\d{2})(\d{2})(\d{3,})$/;
/** Numéro société : FA-MM/CODE/YY-NNN. */
export const SOCIETE_FACTURE_RE = /^FA-(\d{2})\/([A-Z0-9]{1,10})\/(\d{2})-(\d{3,})$/;

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

/** Parties de date LOCALES (année & mois & jour sur 2 chiffres) — ex : 26 / 04 / 27. */
export function factureDateParts(date: Date): { yy: string; mm: string; dd: string } {
  return { yy: pad2(date.getFullYear() % 100), mm: pad2(date.getMonth() + 1), dd: pad2(date.getDate()) };
}

/** Construit un numéro standard : 26FA0427102 (ordre du jour sur 3 chiffres minimum). */
export function formatDailyFactureNumber(date: Date, sequence: number): string {
  const p = factureDateParts(date);
  return `${p.yy}FA${p.mm}${p.dd}${pad3(Math.max(1, sequence))}`;
}

/** Code société normalisé pour le numéro : majuscules, alphanumérique, 10 caractères max. */
export function normalizeSocieteCode(code: string): string {
  return (code || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

/** Construit un numéro société : FA-07/BSA/26-014 (ordre d'établissement sur 3 chiffres minimum). */
export function formatSocieteFactureNumber(prescriptionDate: Date, societeCode: string, sequence: number): string {
  const p = factureDateParts(prescriptionDate);
  return `FA-${p.mm}/${normalizeSocieteCode(societeCode) || 'SOC'}/${p.yy}-${pad3(Math.max(1, sequence))}`;
}

function maxSequence(numbers: string[], extract: (n: string) => number | null): number {
  let max = 0;
  for (const raw of numbers) {
    const seq = extract((raw || '').trim().toUpperCase());
    if (seq != null && Number.isFinite(seq) && seq > max) max = seq;
  }
  return max;
}

/** Prochain numéro d'ordre du jour pour la date donnée (max déjà émis ce jour + 1). */
export function nextDailySequence(numbers: string[], date: Date): number {
  const p = factureDateParts(date);
  return maxSequence(numbers, (n) => {
    const m = DAILY_FACTURE_RE.exec(n);
    return m && m[1] === p.yy && m[2] === p.mm && m[3] === p.dd ? Number(m[4]) : null;
  }) + 1;
}

/** Prochain ordre d'établissement pour une société et un mois de prescriptions donnés. */
export function nextSocieteSequence(numbers: string[], societeCode: string, prescriptionDate: Date): number {
  const p = factureDateParts(prescriptionDate);
  const code = normalizeSocieteCode(societeCode);
  return maxSequence(numbers, (n) => {
    const m = SOCIETE_FACTURE_RE.exec(n);
    if (!m) return null;
    return m[1] === p.mm && m[3] === p.yy && normalizeSocieteCode(m[2]) === code ? Number(m[4]) : null;
  }) + 1;
}

/** Attribue et retourne le prochain numéro standard (26FA0427102) pour la date donnée. */
export function buildDailyFactureNumber(numbers: string[], date: Date): string {
  return formatDailyFactureNumber(date, nextDailySequence(numbers, date));
}

/** Attribue et retourne le prochain numéro société (FA-07/BSA/26-014). */
export function buildSocieteFactureNumber(numbers: string[], societeCode: string, prescriptionDate: Date): string {
  return formatSocieteFactureNumber(prescriptionDate, societeCode, nextSocieteSequence(numbers, societeCode, prescriptionDate));
}

const STOP_WORDS = new Set([
  'DE', 'DES', 'DU', 'DELA', 'DEL', 'LA', 'LE', 'LES', 'ET', 'AU', 'AUX', 'EN', 'SUR', 'SOUS', 'PAR', 'POUR',
  'D', 'L', 'STE', 'STE.', 'CIE', 'MONSIEUR', 'MADAME',
]);

/** Découpe un nom de société en mots significatifs (majuscules, alphanumériques). */
function significantWords(name: string): string[] {
  return (name || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9 '’\-&]/g, ' ')
    .replace(/&/g, ' ET ')
    .split(/[\s'’\-]+/)
    .map(w => w.trim())
    .filter(w => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Diminutif d'une société à partir de son nom :
 *  - plusieurs mots → initiales (ex : « Bureau des Services Administratifs » → BSA) ;
 *  - un seul mot → 3 premiers caractères (ex : JIRAMA → JIR, MCI → MCI) ;
 *  - 2 mots → initiales complétées par les lettres du 1er mot (ex : « BNI Madagascar » → BNM).
 */
export function societeDiminutive(name: string): string {
  const words = significantWords(name);
  if (!words.length) return normalizeSocieteCode(name).slice(0, 3) || 'SOC';
  let out = words.map(w => w[0]).join('');
  let wi = 0;
  let ci = 1;
  while (out.length < 3 && wi < words.length) {
    const w = words[wi];
    if (ci < w.length) {
      out += w[ci];
      ci += 1;
    } else {
      wi += 1;
      ci = 1;
    }
  }
  return out.slice(0, 4);
}

/** Vrai si le code enregistré est vide ou un code automatique « SOC-01 » (à remplacer par un diminutif). */
export function isAutoGeneratedCode(code?: string): boolean {
  if (!code || !code.trim()) return true;
  return /^SOC-\d+$/i.test(code.trim());
}

/** Génère un diminutif unique, non utilisé par les codes existants (suffixe 2, 3… en cas de collision). */
export function generateUniqueSocieteCode(name: string, existingCodes: string[]): string {
  const taken = new Set(existingCodes.map(c => normalizeSocieteCode(c)).filter(Boolean));
  const base = normalizeSocieteCode(societeDiminutive(name)) || 'SOC';
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${(Date.now() % 89) + 10}`;
}

/** Rassemble tous les numéros de facture déjà émis (ventes, factures caisse, prestations assurance). */
export function collectExistingFactureNumbers(state: {
  ventes?: Array<{ numeroFacture?: string }>;
  invoices?: Array<{ numeroFacture?: string }>;
  assurancePrestations?: Array<{ numeroFacture?: string }>;
}): string[] {
  return [
    ...(state.ventes || []).map(v => v.numeroFacture),
    ...(state.invoices || []).map(i => i.numeroFacture),
    ...(state.assurancePrestations || []).map(p => p.numeroFacture),
  ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}
