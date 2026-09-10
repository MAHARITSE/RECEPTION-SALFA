import type { AppState } from '../../store';
import type { BillingItem } from './monthlyBilling';

const normalize = (value: string) => value.trim().normalize('NFKC').toUpperCase().replace(/\s+/g, ' ');

/** Equivalent family codes, not guesses from an article's description. */
export function canonicalBillingFamilyCode(value?: string): string {
  const code = normalize(value || '');
  if (['PH', 'PHAR', 'PHARMACIE', 'MEDIC'].includes(code)) return 'MEDIC';
  if (['LAB', 'LABO'].includes(code)) return 'LABO';
  return code;
}
const categories: Record<string, string> = { consultation: 'CONS', pharmacy: 'MEDIC', lab: 'LABO', echo: 'ECHO', surgery: 'CHIR', hospitalization: 'HOSP', bloc: 'BLOC', externe: 'EXT' };

/** Resolve the real catalog family before falling back to a broad Caisse category.
 * This runs on creation, never while rendering an already frozen invoice. */
export function billingFamilyResolver(state: AppState) {
  const aliases = new Map<string, Set<string>>();
  const add = (alias: string, code: string) => {
    const key = normalize(alias);
    if (!key) return;
    const values = aliases.get(key) || new Set<string>();
    values.add(canonicalBillingFamilyCode(code)); aliases.set(key, values);
  };
  state.familles.forEach(f => { add(f.code, f.code); add(f.id, f.code); });
  state.assuranceFamilles?.forEach(f => { add(f.code, f.code); add(f.id, f.code); f.aliases?.forEach(a => add(a, f.code)); });
  const family = (value: string) => {
    const matches = aliases.get(normalize(value));
    return matches?.size === 1 ? [...matches][0] : undefined;
  };
  return (source: { articleId?: string; articleCode?: string; articleName?: string; familyCode?: string; category?: string }) => {
    if (source.familyCode?.trim()) return family(source.familyCode) || canonicalBillingFamilyCode(source.familyCode);
    let articles = source.articleId ? state.articles.filter(a => a.id === source.articleId)
      : source.articleCode?.trim() ? state.articles.filter(a => normalize(a.id) === normalize(source.articleCode!) || normalize(a.code || '') === normalize(source.articleCode!)) : [];
    if (!articles.length && source.articleName?.trim()) articles = state.articles.filter(a => normalize(a.name) === normalize(source.articleName!));
    // An identified article with an invalid family must be corrected in the catalog;
    // a generic category must not disguise the problem. Never choose a duplicate name.
    if (articles.length > 1) return undefined;
    if (articles.length === 1) {
      const code = articles[0].family?.trim();
      return code ? family(code) || (['MEDIC', 'LABO', 'ECHO', 'HOSP', 'DENT'].includes(canonicalBillingFamilyCode(code)) ? canonicalBillingFamilyCode(code) : undefined) : undefined;
    }
    if (source.articleCode && family(source.articleCode)) return family(source.articleCode)!;
    return source.category ? categories[source.category] : undefined;
  };
}

/** One total per family, separately for each original invoice/beneficiary row.
 * Missing historical metadata stays unknown; no lookup of today's catalog. */
export function groupBillingItemsByFamily(items: BillingItem[]): { family: string; amount: number }[] {
  const groups = new Map<string, number>();
  for (const item of items) {
    const key = canonicalBillingFamilyCode(item.actCode) || 'Famille non renseignée';
    groups.set(key, (groups.get(key) || 0) + item.amount);
  }
  return [...groups].map(([family, amount]) => ({ family, amount: Math.round(amount * 100) / 100 }));
}


export function auditArticleFamilies(state: AppState) {
  const resolve = billingFamilyResolver(state);
  return state.articles.filter(a => !resolve({ articleId: a.id })).map(a => ({ id: a.id, name: a.name, family: a.family || '', reason: a.family?.trim() ? 'Famille absente du référentiel' : 'Famille obligatoire manquante' }));
}
