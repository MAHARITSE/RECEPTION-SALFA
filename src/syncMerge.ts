import type { AppState } from './store';
import { preserveMonthlyInvoices } from './modules/assurance/monthlyBilling';
import { syncSharedInvoiceBalances } from './modules/assurance/sharedData';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  FUSION MULTI-POSTES (WAMP / MySQL)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Plusieurs postes (médecin, caisse, laboratoire, pharmacie…) travaillent en
 *  même temps sur la même base MySQL. Chaque poste garde son état en mémoire :
 *  sans fusion, le dernier poste qui enregistre écrase les saisies des autres
 *  (c'est ce qui faisait disparaître les consultations du médecin de la file
 *  d'attente de la caisse).
 *
 *  La fusion est une réconciliation à trois versions :
 *    • `base`   : dernier état confirmé côté MySQL pour CE poste ;
 *    • `local`  : état courant du poste (saisies pas encore enregistrées) ;
 *    • `remote` : état lu à l'instant dans MySQL (saisies des autres postes).
 *
 *  Règles, par enregistrement (identifié par `id`) :
 *    • présent seulement chez `remote`            → ajouté (saisie d'un collègue) ;
 *    • présent seulement chez `local` et absent de `base` → conservé (création locale non encore poussée) ;
 *    • présent seulement chez `local` mais présent dans `base` → supprimé (retiré par un collègue) ;
 *    • présent des deux côtés → la version locale gagne UNIQUEMENT si elle
 *      diffère de `base` (modification locale en attente) ; sinon la version
 *      distante est prise (modification d'un collègue).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Collections « liste » réconciliées enregistrement par enregistrement. */
export const MERGEABLE_LISTS = [
  'assuranceSocietes', 'assurancePersonnes', 'assuranceFamilles', 'assurancePrestations', 'assurancePaiements',
  'patients', 'consultations', 'invoices', 'ventes', 'venteLines', 'ventePayments',
  'labRequests', 'journey', 'pharmaDeliveryItems', 'stockEntries', 'stockTransfers',
  'stockMovements', 'movementHeaders', 'movementLines', 'companyBillingAccounts',
  'hbRecords', 'messages', 'notifications', 'cashClosings', 'auditLogs',
  'inventorySessions', 'pharmaDeliveryClosings', 'users', 'companies', 'articles',
  'fournisseurs', 'familles', 'labCatalog', 'warehouseServices', 'etablissements',
] as const;

export type MergeableList = (typeof MERGEABLE_LISTS)[number];

/** Compteurs scalaires : on garde toujours la valeur la plus haute (séquences). */
const COUNTER_KEYS = ['factureCounter', 'pharmaClosingCounter'] as const;

type Rec = { id?: string } & Record<string, unknown>;

const stable = (v: unknown): string => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

const asList = (value: unknown): Rec[] => (Array.isArray(value) ? (value as Rec[]) : []);

const indexById = (rows: Rec[]): Map<string, Rec> => {
  const m = new Map<string, Rec>();
  rows.forEach((r) => {
    const id = typeof r?.id === 'string' ? r.id : undefined;
    if (id) m.set(id, r);
  });
  return m;
};

/** Réconcilie une collection (liste d'objets possédant un `id`). */
export function mergeList(base: unknown, local: unknown, remote: unknown): Rec[] {
  const baseRows = asList(base);
  const localRows = asList(local);
  const remoteRows = asList(remote);

  const baseMap = indexById(baseRows);
  const localMap = indexById(localRows);
  const remoteMap = indexById(remoteRows);

  const result: Rec[] = [];
  const done = new Set<string>();

  // 1) On parcourt d'abord l'ordre local (préserve l'ordre d'affichage du poste)
  for (const row of localRows) {
    const id = typeof row?.id === 'string' ? row.id : undefined;
    if (!id || done.has(id)) continue;
    done.add(id);
    const remoteRow = remoteMap.get(id);
    const baseRow = baseMap.get(id);
    if (!remoteRow) {
      // Absent de MySQL : création locale non encore poussée → conservée.
      // S'il était déjà dans `base`, c'est une suppression faite par un collègue.
      if (!baseRow) result.push(row);
      continue;
    }
    const changedLocally = !baseRow || stable(baseRow) !== stable(row);
    result.push(changedLocally ? row : remoteRow);
  }

  // 2) Puis tout ce qui n'existe que côté MySQL (saisies des autres postes)
  for (const row of remoteRows) {
    const id = typeof row?.id === 'string' ? row.id : undefined;
    if (!id || done.has(id)) continue;
    done.add(id);
    // Présent dans `base` mais plus en local → supprimé volontairement ici.
    if (baseMap.has(id) && !localMap.has(id)) continue;
    result.push(row);
  }

  return result;
}

/** Identifiants supprimés localement depuis le dernier enregistrement confirmé. */
export function deletedIds(base: unknown, local: unknown): string[] {
  const localIds = new Set(asList(local).map((r) => r.id).filter((v): v is string => typeof v === 'string'));
  return asList(base)
    .map((r) => r.id)
    .filter((id): id is string => typeof id === 'string' && !localIds.has(id));
}

/** Toutes les suppressions locales, par collection (payload envoyé à l'API). */
export function collectDeletions(base: AppState | null, local: AppState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!base) return out;
  for (const key of MERGEABLE_LISTS) {
    const ids = deletedIds((base as unknown as Record<string, unknown>)[key], (local as unknown as Record<string, unknown>)[key]);
    if (ids.length > 0) out[key] = ids;
  }
  return out;
}

/**
 * Réconcilie l'état complet du poste avec l'état lu dans MySQL.
 * `currentUser` (session locale) n'est JAMAIS remplacé.
 */
export function mergeStates(base: AppState | null, local: AppState, remote: AppState): AppState {
  const merged: Record<string, unknown> = { ...local };
  const baseRec = (base || {}) as unknown as Record<string, unknown>;
  const localRec = local as unknown as Record<string, unknown>;
  const remoteRec = remote as unknown as Record<string, unknown>;

  for (const key of MERGEABLE_LISTS) {
    merged[key] = mergeList(base ? baseRec[key] : undefined, localRec[key], remoteRec[key]);
  }

  // Paramètres d'impression : la version locale ne gagne que si elle a été modifiée ici.
  const baseSettings = base ? stable(baseRec.ticketSettings) : null;
  const localChangedSettings = baseSettings !== null && baseSettings !== stable(localRec.ticketSettings);
  if (!localChangedSettings && remoteRec.ticketSettings) {
    merged.ticketSettings = remoteRec.ticketSettings;
  }

  // Compteurs séquentiels : la valeur la plus élevée l'emporte (aucun numéro réutilisé).
  for (const key of COUNTER_KEYS) {
    const l = typeof localRec[key] === 'number' ? (localRec[key] as number) : 0;
    const r = typeof remoteRec[key] === 'number' ? (remoteRec[key] as number) : 0;
    merged[key] = Math.max(l, r);
  }

  if (remote.assuranceStorageSupported !== undefined) merged.assuranceStorageSupported = remote.assuranceStorageSupported;

  merged.monthlyInvoices = preserveMonthlyInvoices(remote.monthlyInvoices, local.monthlyInvoices);

  // La session du poste reste celle de l'utilisateur connecté ici.
  merged.currentUser = localRec.currentUser ?? null;

  return syncSharedInvoiceBalances(merged as unknown as AppState);
}

/** Vrai si la fusion n'a rien changé pour ce poste (évite un re-rendu inutile). */
export function sameBusinessData(a: AppState, b: AppState): boolean {
  if (stable(a.monthlyInvoices || []) !== stable(b.monthlyInvoices || [])) return false;
  if (a.assuranceStorageSupported !== b.assuranceStorageSupported) return false;
  const aRec = a as unknown as Record<string, unknown>;
  const bRec = b as unknown as Record<string, unknown>;
  for (const key of MERGEABLE_LISTS) {
    if (stable(aRec[key]) !== stable(bRec[key])) return false;
  }
  if (stable(aRec.ticketSettings) !== stable(bRec.ticketSettings)) return false;
  for (const key of COUNTER_KEYS) {
    if (aRec[key] !== bRec[key]) return false;
  }
  return true;
}
