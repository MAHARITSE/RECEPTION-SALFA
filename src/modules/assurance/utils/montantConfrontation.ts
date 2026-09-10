import { formatMoney } from './formatters';

/**
 * Règle de comparaison des montants utilisée partout où l'on rattache un acte
 * prescrit à une ligne de règlement (fenêtre « Rattacher un acte prescrit à
 * cette ligne de règlement » de l'import décompte ET du règlement saisi).
 *
 * Règle métier : le montant à comparer est
 *   • d'une part le « Montant_Reclame_Brut » lu dans l'importation du règlement
 *     (appelé « Brut sans TM » dans l'interface, car c'est la part réclamée à
 *     l'assureur, ticket modérateur du patient déjà déduit),
 *   • d'autre part le « montant sans TM » de l'acte prescrit en base,
 *     c'est-à-dire total de l'acte − ticket modérateur de l'acte.
 *
 * L'écart obtenu (Montant_Reclame_Brut importé − montant sans TM de l'acte) est
 * à la fois le critère de classement des actes candidats (tri par pertinence et
 * tri par écart de montant) et le résultat affiché dans chaque ligne de résultat.
 */

/** Tolérance d'arrondi en Ariary : en deçà, les montants sont considérés égaux. */
export const MONTANT_TOLERANCE = 2;

/** Écart relatif maximum pour considérer deux montants « proches » (15 %). */
export const MONTANT_PROXIMITE_RATIO = 0.15;

/** Libellé unique du montant de l'importation, tel qu'il doit être affiché à l'écran. */
export const MONTANT_IMPORT_LABEL = 'Montant_Reclame_Brut (importation)';
export const MONTANT_ACTE_LABEL = 'Montant sans TM de l\'acte prescrit';

export interface ActeMontantSource {
  /** Total brut de l'acte prescrit (ticket modérateur inclus). */
  montantInitial?: number | null;
  /** Ticket modérateur de l'acte prescrit (part patient). */
  ticketModerateur?: number | null;
  /** Net à rembourser déjà enregistré pour l'acte (utilisé en secours). */
  montantARembourser?: number | null;
}

export interface MontantConfrontation {
  /** Montant_Reclame_Brut de la ligne de règlement importée / saisie. */
  brutImport: number;
  /** Total brut de l'acte prescrit (TM inclus). */
  brutActe: number;
  /** Ticket modérateur de l'acte prescrit. */
  tmActe: number;
  /** Base de comparaison côté acte : total de l'acte hors ticket modérateur. */
  montantSansTM: number;
  /** écart = brutImport − montantSansTM (négatif si l'acte est plus élevé). */
  ecart: number;
  ecartAbsolu: number;
  /** Écart relatif (0 → identique, 1 → 100 % d'écart). */
  ecartRelatif: number;
  /** La comparaison a du sens : les deux montants sont renseignés. */
  isComparable: boolean;
  /** Montants identiques (à la tolérance d'arrondi près). */
  isConforme: boolean;
  /** Montants proches (≤ 15 %) mais non identiques. */
  isProche: boolean;
  label: string;
  shortLabel: string;
  /** Classes Tailwind du badge de comparaison. */
  badgeClass: string;
  /** Couleur du chiffre de l'écart. */
  ecartTextClass: string;
}

/**
 * Retourne le montant de l'acte prescrit HORS ticket modérateur.
 * Si le total brut manque, on retombe sur le net à rembourser déjà enregistré
 * (qui est, par construction, le montant hors TM).
 */
export function getMontantSansTM(acte?: ActeMontantSource | null): {
  brutActe: number;
  tmActe: number;
  montantSansTM: number;
} {
  const brutActe = Math.round(Number(acte?.montantInitial || 0));
  const tmActe = Math.round(Number(acte?.ticketModerateur || 0));
  const aRembourser = Math.round(Number(acte?.montantARembourser || 0));

  const sansTM = brutActe > 0 ? Math.max(0, brutActe - tmActe) : aRembourser;
  return { brutActe, tmActe, montantSansTM: Math.round(sansTM) };
}

/** Formate un écart signé de manière lisible (« + 2 000 Ar », « − 2 000 Ar »). */
export function formatEcartMontant(ecart: number): string {
  const value = Math.round(Number(ecart || 0));
  if (value === 0) return '0 Ar';
  const sign = value > 0 ? '+' : '−';
  return `${sign} ${formatMoney(Math.abs(value))}`;
}

/**
 * Compare le Montant_Reclame_Brut de l'importation au montant sans TM de l'acte
 * prescrit et prépare le résultat pour le tri des candidats et son affichage.
 */
export function computeMontantConfrontation(
  brutImport: number | null | undefined,
  acte?: ActeMontantSource | null
): MontantConfrontation {
  const brut = Math.round(Number(brutImport || 0));
  const { brutActe, tmActe, montantSansTM } = getMontantSansTM(acte);

  const ecart = brut - montantSansTM;
  const ecartAbsolu = Math.abs(ecart);
  const isComparable = brut > 0 && montantSansTM > 0;
  const isConforme = isComparable && ecartAbsolu < MONTANT_TOLERANCE;
  const ecartRelatif = montantSansTM > 0 ? ecartAbsolu / montantSansTM : brut > 0 ? Infinity : 0;
  const isProche = isComparable && !isConforme && ecartRelatif <= MONTANT_PROXIMITE_RATIO;

  const label = !isComparable
    ? 'Montant non comparable'
    : isConforme
    ? 'Montant sans TM conforme'
    : `Écart de ${formatMoney(ecartAbsolu)}${ecartRelatif !== Infinity ? ` (${Math.round(ecartRelatif * 100)} %)` : ''}`;

  return {
    brutImport: brut,
    brutActe,
    tmActe,
    montantSansTM,
    ecart,
    ecartAbsolu,
    ecartRelatif,
    isComparable,
    isConforme,
    isProche,
    label,
    shortLabel: !isComparable ? '—' : isConforme ? 'Conforme' : `Écart ${formatEcartMontant(ecart)}`,
    badgeClass: !isComparable
      ? 'bg-slate-100 text-slate-700 border-slate-300'
      : isConforme
      ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
      : isProche
      ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold'
      : 'bg-rose-100 text-rose-900 border-rose-300 font-semibold',
    ecartTextClass: !isComparable
      ? 'text-slate-500'
      : isConforme
      ? 'text-emerald-700'
      : isProche
      ? 'text-amber-700'
      : 'text-rose-700',
  };
}

/**
 * Score de proximité de montant utilisé pour départager les actes candidats :
 * plus l'écart est faible, plus le score est élevé (0 à 100).
 */
export function montantProximiteScore(c: MontantConfrontation): number {
  if (!c.isComparable) return 0;
  if (c.isConforme) return 100;
  if (c.ecartRelatif === Infinity) return 0;
  return Math.max(0, Math.round(100 * (1 - Math.min(1, c.ecartRelatif))));
}

/**
 * Modes de tri disponibles dans les listes d'actes candidats des fenêtres
 * « Rattacher un acte prescrit à cette ligne de règlement » (import décompte
 * et règlement saisi). Partagés pour que les deux fenêtres se comportent pareil.
 */
export type ActSortMode = 'DATE_ASC' | 'DATE_DESC' | 'MONTANT_ASC' | 'MONTANT_DESC' | 'PERTINENCE';

export interface ActSortOption {
  key: ActSortMode;
  label: string;
  title: string;
}

export const ACT_SORT_OPTIONS: ActSortOption[] = [
  {
    key: 'DATE_ASC',
    label: 'Date croissante ↑',
    title: "Trier les actes par date de soins croissante (plus anciens d'abord) ; l'écart de montant départage les ex æquo",
  },
  {
    key: 'DATE_DESC',
    label: 'Date décroissante ↓',
    title: "Trier les actes par date de soins décroissante (plus récents d'abord) ; l'écart de montant départage les ex æquo",
  },
  {
    key: 'MONTANT_ASC',
    label: 'Écart de montant ↑',
    title: `Tri par résultat de la comparaison « ${MONTANT_IMPORT_LABEL} ↔ ${MONTANT_ACTE_LABEL} » : montants identiques d'abord, puis écarts croissants`,
  },
  {
    key: 'MONTANT_DESC',
    label: 'Écart de montant ↓',
    title: `Tri inverse : les plus gros écarts entre ${MONTANT_IMPORT_LABEL} et ${MONTANT_ACTE_LABEL} d'abord`,
  },
  {
    key: 'PERTINENCE',
    label: 'Pertinence',
    title: 'Tri par pertinence : même date + même montant sans TM, même date, même montant, écart de montant croissant, similarité de nom, date la plus proche',
  },
];

/** Libellé court du tri courant, affiché dans l'en-tête de la liste de résultats. */
export function actSortLabel(mode: ActSortMode): string {
  switch (mode) {
    case 'DATE_DESC':
      return 'date décroissante';
    case 'MONTANT_ASC':
      return 'écart de montant croissant';
    case 'MONTANT_DESC':
      return 'écart de montant décroissant';
    case 'PERTINENCE':
      return 'pertinence';
    case 'DATE_ASC':
    default:
      return 'date croissante';
  }
}

/** Rappel de la règle de comparaison, affiché au-dessus des résultats de rattachement. */
export const MONTANT_COMPARISON_HINT = `Montant comparé : ${MONTANT_IMPORT_LABEL} ↔ ${MONTANT_ACTE_LABEL} (total de l'acte − ticket modérateur). Conforme sous ${MONTANT_TOLERANCE} Ar, proximité ≤ ${Math.round(MONTANT_PROXIMITE_RATIO * 100)} %.`;
