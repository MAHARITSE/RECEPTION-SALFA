import type { Article, ArticleFamily, Famille, Vente, VenteLine } from '../types';

/**
 * RÈGLES DES FAMILLES DU DÉPÔT (catalogue, stock, rattachement des ventes).
 *
 * Module autonome — sans import du store — pour rester testable hors navigateur.
 * Le store ré-exporte ces helpers : les modules continuent d'importer depuis
 * `../store` comme avant.
 *
 * Principe métier : SEULS LES MÉDICAMENTS sont gérés en stock. Les actes et
 * services (consultation, laboratoire, échographie, hospitalisation, dentaire)
 * et la famille « Autres » se vendent sans contrôle ni décompte de stock, sauf
 * activation manuelle explicite d'une famille dans le module Magasinier.
 *
 * Rattachement : chaque article appartient à une famille, chaque ligne vendue
 * porte la famille de son article et chaque vente porte la famille de ses lignes
 * (dominante si la vente mélange plusieurs familles).
 */

/** Portion de l'état dont les règles de familles ont besoin. */
export interface EtatFamilles {
  familles?: Famille[];
  articles?: Article[];
  venteLines?: VenteLine[];
  ventes?: Vente[];
}

/**
 * Familles du catalogue. SEULE la famille Médicaments est gérée en stock :
 * les actes et services (consultation, laboratoire, échographie, hospitalisation,
 * dentaire) et la famille fourre-tout « Autres » ne donnent lieu à aucun
 * contrôle, décompte ni alerte de stock — sauf activation manuelle explicite
 * dans le module Magasinier (`manageStock: true`).
 */
export const DEFAULT_FAMILLES: Famille[] = [
  { id: 'fam-medic', code: 'MEDIC', name: 'Médicaments', color: '#0D47A1', order: 1, manageStock: true },
  { id: 'fam-consult', code: 'CONSULT', name: 'Consultation', color: '#0EA5E9', order: 2, manageStock: false },
  { id: 'fam-labo', code: 'LABO', name: 'Laboratoire', color: '#10B981', order: 3, manageStock: false },
  { id: 'fam-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 4, manageStock: false },
  { id: 'fam-hosp', code: 'HOSP', name: 'Hospitalisation', color: '#F97316', order: 5, manageStock: false },
  // Conservé pour les données déjà présentes et les consommables dentaires.
  { id: 'fam-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 6, manageStock: false },
  // Famille de rattachement par défaut : tout article / toute vente appartient à
  // une famille, les éléments non classés tombent ici.
  { id: 'fam-autres', code: 'AUTRES', name: 'Autres', color: '#64748B', order: 7, manageStock: false },
];

/** Famille de rattachement par défaut (articles / ventes non classés). */
export const FAMILLE_AUTRES = 'AUTRES';

/** Famille d'un acte ou d'un produit d'après sa catégorie de caisse. */
const FAMILLE_PAR_CATEGORIE: Record<string, string> = {
  pharmacy: 'MEDIC', medicament: 'MEDIC', lab: 'LABO', labo: 'LABO', echo: 'ECHO',
  consultation: 'CONSULT', consult: 'CONSULT', surgery: 'HOSP', hospitalization: 'HOSP',
  hospitalisation: 'HOSP', bloc: 'HOSP', externe: FAMILLE_AUTRES,
};

// Base familles standard : normalise vers majuscules et convertit l'ancien code LAB vers LABO
export function normalizeFamilyCode(code?: string): string {
  const c = (code || '').trim().toUpperCase();
  return c === 'LAB' ? 'LABO' : c;
}

export const ARTICLE_FAMILIES: ArticleFamily[] = DEFAULT_FAMILLES.map((f) => f.code);

export function getArticleFamilyCatalog(familles: Famille[] = []): Famille[] {
  const byCode = new Map<string, Famille>();
  DEFAULT_FAMILLES.forEach((f) => byCode.set(f.code, f));
  familles.forEach((f, idx) => {
    const code = normalizeFamilyCode(f.code);
    if (!code) return;
    const defaut = byCode.get(code);
    // Une famille déjà enregistrée sans réglage de stock hérite du défaut de sa
    // famille de référence (géré pour les médicaments, non géré pour les actes).
    byCode.set(code, {
      ...f, code, order: f.order ?? idx + 1,
      manageStock: typeof f.manageStock === 'boolean' ? f.manageStock : defaut?.manageStock,
    });
  });
  return Array.from(byCode.values()).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}

export function familyLabel(f: ArticleFamily | string | undefined, familles: Famille[] = []): string {
  const code = normalizeFamilyCode(f);
  const fam = getArticleFamilyCatalog(familles).find((x) => x.code === code);
  return fam?.name || code || '—';
}

/**
 * La famille gère-t-elle son stock ?
 * SEULS LES MÉDICAMENTS sont gérés en stock par défaut : consultation,
 * laboratoire, échographie, hospitalisation, dentaire et « autres » sont des
 * actes / services sans stock (ni contrôle de vente, ni décompte, ni alerte).
 * Le réglage explicite d'une famille (`manageStock`) reste prioritaire : une
 * autre famille peut être activée à la main dans le module Magasinier.
 */
export function familyManagesStock(code: string | undefined, familles: Famille[] = []): boolean {
  const c = normalizeFamilyCode(code);
  const fam = getArticleFamilyCatalog(familles).find((x) => x.code === c);
  if (fam) return fam.manageStock === true;
  return c === 'MEDIC';
}

export function isLabFamily(code?: string): boolean {
  const c = normalizeFamilyCode(code);
  return c === 'LABO' || c === 'LAB';
}

export function isEchoFamily(code?: string): boolean {
  return normalizeFamilyCode(code) === 'ECHO';
}

/** Famille Hospitalisation (actes et forfaits d'hospitalisation, non gérés en stock). */
export function isHospFamily(code?: string): boolean {
  return normalizeFamilyCode(code) === 'HOSP';
}

/** Famille Consultation (acte médical, jamais géré en stock). */
export function isConsultFamily(code?: string): boolean {
  const c = normalizeFamilyCode(code);
  return c === 'CONSULT' || c === 'CONSULTATION' || c === 'CONS';
}

/**
 * Famille dont les articles peuvent être prescrits / entrer en pharmacie :
 * tout sauf les actes purs (laboratoire, échographie, hospitalisation,
 * consultation) — une consultation se facture par la consultation elle-même.
 */
export function isMedicationEntryFamily(code?: string): boolean {
  return !isLabFamily(code) && !isEchoFamily(code) && !isHospFamily(code) && !isConsultFamily(code);
}

/**
 * Famille d'une ligne vendue : celle de l'article au catalogue (par identifiant,
 * sinon par nom exact), à défaut celle de sa catégorie de caisse, et en dernier
 * recours « Autres ». TOUT article vendu appartient donc à une famille.
 */
export function familleLigneVente(
  state: Pick<EtatFamilles, 'articles' | 'familles'>,
  line: { family?: string; articleId?: string; articleName?: string; category?: string },
): string {
  // Une famille déjà enregistrée et connue du catalogue est conservée telle quelle.
  const deja = normalizeFamilyCode(line?.family);
  if (deja && getArticleFamilyCatalog(state?.familles || []).some((f) => f.code === deja)) return deja;
  const articles = state?.articles || [];
  const nom = (line?.articleName || '').trim().toLowerCase();
  const art = (line?.articleId && articles.find((a) => a.id === line.articleId))
    || (nom && articles.find((a) => (a.name || '').trim().toLowerCase() === nom))
    || undefined;
  const depuisArticle = normalizeFamilyCode(art?.family);
  if (depuisArticle) return depuisArticle;
  return FAMILLE_PAR_CATEGORIE[(line?.category || '').trim().toLowerCase()] || FAMILLE_AUTRES;
}

/** Montant net d'une ligne de vente ou d'une ligne de facture (pour le poids des familles). */
function montantLigneFamille(line: { amount?: number; quantity?: number; unitPrice?: number; discount?: number }): number {
  if (typeof line?.amount === 'number') return Math.max(0, line.amount);
  const base = (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0);
  return Math.max(0, base * (1 - (Number(line?.discount) || 0) / 100));
}

/**
 * Famille d'une VENTE : la famille de ses lignes si elles sont toutes de la même
 * famille, sinon la famille DOMINANTE — départagée par le montant, puis par le
 * nombre de lignes, puis par l'ordre du catalogue (Médicaments en tête).
 * « Autres » ne sert donc qu'aux éléments réellement non classés, jamais aux
 * ventes mixtes : le détail par famille reste porté par les lignes.
 */
export function familleVente(
  state: Pick<EtatFamilles, 'articles' | 'familles'>,
  lines: Array<{ family?: string; articleId?: string; articleName?: string; category?: string; amount?: number; quantity?: number; unitPrice?: number; discount?: number }> = [],
): string {
  if (!lines.length) return FAMILLE_AUTRES;
  const catalogue = getArticleFamilyCatalog(state?.familles || []);
  const ordre = (code: string) => {
    const i = catalogue.findIndex((f) => f.code === code);
    return i < 0 ? catalogue.length : i;
  };
  const poids = new Map<string, { montant: number; lignes: number }>();
  for (const l of lines) {
    const fam = familleLigneVente(state, l);
    const p = poids.get(fam) || { montant: 0, lignes: 0 };
    p.montant += montantLigneFamille(l);
    p.lignes += 1;
    poids.set(fam, p);
  }
  if (poids.size === 1) return [...poids.keys()][0];
  return [...poids.entries()].sort((a, b) =>
    b[1].montant - a[1].montant || b[1].lignes - a[1].lignes || ordre(a[0]) - ordre(b[0]),
  )[0][0];
}

/**
 * Normalise la base des familles : MEDIC / LABO / ECHO sont toujours présents,
 * LAB est migré vers LABO, et les articles suivent le code normalisé.
 */
export function normalizeFamilyBases<T extends EtatFamilles>(state: T): T {
  const seen = new Set<string>();
  const normalizedExisting = (state.familles || [])
    .map((f, idx) => ({ ...f, code: normalizeFamilyCode(f.code), order: f.order ?? idx + 1 }))
    .filter((f) => {
      if (!f.code || seen.has(f.code)) return false;
      seen.add(f.code);
      return true;
    });
  const merged = getArticleFamilyCatalog(normalizedExisting).map((f, idx) => ({ ...f, order: idx + 1 }));
  return {
    ...state,
    familles: merged,
    // Chaque article appartient à une famille : un article non classé est
    // rattaché à « Autres » (jamais laissé vide).
    articles: (state.articles || []).map((a) => ({ ...a, family: normalizeFamilyCode(a.family) || FAMILLE_AUTRES })),
  } as T;
}

/**
 * RATTACHEMENT DES VENTES À UNE FAMILLE.
 * Toute ligne vendue porte la famille de son article (catalogue, sinon catégorie,
 * sinon « Autres ») et toute vente porte la famille de ses lignes (dominante si la
 * vente mélange plusieurs familles). Complémentaire et idempotent : une famille
 * déjà enregistrée et connue du catalogue n'est jamais réécrite.
 */
export function normalizeVenteFamilies<T extends EtatFamilles>(state: T): T {
  const lignes = state.venteLines || [];
  const ventes = state.ventes || [];
  if (!lignes.length && !ventes.length) return state;

  let lignesModifiees = false;
  const nouvellesLignes = lignes.map((l) => {
    const fam = familleLigneVente(state, l);
    if (l.family === fam) return l;
    lignesModifiees = true;
    return { ...l, family: fam };
  });

  const lignesParVente = new Map<string, typeof nouvellesLignes>();
  for (const l of nouvellesLignes) {
    const lot = lignesParVente.get(l.venteId) || [];
    lot.push(l);
    lignesParVente.set(l.venteId, lot);
  }

  let ventesModifiees = false;
  const nouvellesVentes = ventes.map((v) => {
    // Une vente déjà rattachée à une famille connue du catalogue garde la sienne :
    // la règle ne complète que ce qui manque (ou corrige un code inconnu).
    const deja = normalizeFamilyCode(v.family);
    const fam = deja && getArticleFamilyCatalog(state.familles || []).some((f) => f.code === deja)
      ? deja
      : familleVente(state, lignesParVente.get(v.id) || []);
    if (v.family === fam) return v;
    ventesModifiees = true;
    return { ...v, family: fam };
  });

  if (!lignesModifiees && !ventesModifiees) return state;
  return { ...state, venteLines: nouvellesLignes, ventes: nouvellesVentes } as T;
}
