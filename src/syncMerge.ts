import type { AppState } from './store';
import { preserveMonthlyInvoices } from './modules/assurance/monthlyBilling';
import { syncSharedInvoiceBalances } from './modules/assurance/sharedData';
import { repairVenteHeaders } from './moneyRepair';

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
  const localRows = asList(local);
  const remoteRows = asList(remote);

  // ── Chemin rapide : aucune modification locale (même référence) → le
  // distant fait foi, dans l'ordre local puis les ajouts distants.
  // Sémantique STRICTEMENT identique au chemin lent, sans aucun stringify
  // (précondition : `id` uniques par collection — garanti par MySQL/PK et la
  // déduplication du chemin lent ; des `id` dupliqués sont une entrée corrompue).
  if (local === base) {
    // NOTE : aucun retour anticipé sur les seuls `id` ici — un collègue peut
    // avoir MODIFIÉ une ligne (même `id`, contenu différent), et sa version
    // distante doit gagner. Seule certitude sans stringify : rien n'a été
    // créé ni supprimé PAR CE POSTE (même référence que la base confirmée).
    const baseRows = asList(base);
    const remoteById = indexById(remoteRows);
    const seen = new Set<string>();
    const out: Rec[] = [];
    for (const b of baseRows) {
      const id = typeof b?.id === 'string' ? b.id : undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const r = remoteById.get(id);
      if (r) out.push(r); // absent du distant → supprimé par un collègue
    }
    for (const r of remoteRows) {
      const id = typeof r?.id === 'string' ? r.id : undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
    return out;
  }

  const baseRows = asList(base);
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
    // Même référence = inchangé : on évite le stringify (cas général : les
    // mises à jour React préservent les références des lignes intactes).
    const changedLocally = row !== baseRow && (!baseRow || stable(baseRow) !== stable(row));
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

  // Rien n'a bougé → on garde la référence locale (comparaisons rapides).
  if (result.length === localRows.length && result.every((r, i) => r === localRows[i])) {
    return localRows;
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
 * Fusionne les lignes de paiement IMBRIQUÉES d'un enregistrement (relevés
 * sociétés, dossiers hospit/bloc) : deux postes ajoutant un règlement en même
 * temps créent deux lignes distinctes — l'union par `id` les préserve toutes
 * les deux, là où « dernier écrivain gagne » en perdrait une.
 * Les lignes historiques sans `id` sont départagées par une clé composite.
 */
function unionNestedPayments(
  mergedRows: Rec[],
  localRows: Rec[],
  remoteRows: Rec[],
  /** Comptes sociétés : maintient `paidAmount`/statut. Dossiers hospit/bloc :
   *  aucun total figé → union seule, aucun champ parasite ajouté. */
  withTotal: boolean,
): Rec[] {
  const localById = indexById(localRows);
  const remoteById = indexById(remoteRows);
  const keyOf = (p: Rec): string => {
    const id = typeof p?.id === 'string' ? p.id : '';
    if (id) return `id:${id}`;
    return `legacy:${p?.date || ''}|${p?.amount ?? ''}|${p?.paidBy || ''}|${p?.method || ''}|${p?.reference || ''}|${p?.receivedBy || ''}`;
  };
  let changed = false;
  const out = mergedRows.map((row) => {
    const id = typeof row?.id === 'string' ? row.id : undefined;
    const l = id ? localById.get(id) : undefined;
    const r = id ? remoteById.get(id) : undefined;
    const seen = new Map<string, Rec>();
    for (const src of [l, r, row]) {
      const arr = src ? (src as Record<string, unknown>).payments : undefined;
      if (!Array.isArray(arr)) continue;
      for (const p of arr as Rec[]) {
        const k = keyOf(p);
        if (!seen.has(k)) seen.set(k, p);
      }
    }
    const payments = [...seen.values()];
    const prev = Array.isArray((row as Record<string, unknown>).payments)
      ? ((row as Record<string, unknown>).payments as Rec[]) : [];
    const sum = Math.round(payments.reduce((s, p) => s + (typeof p?.amount === 'number' ? p.amount : 0), 0) * 100) / 100;
    const prevAmount = typeof (row as Record<string, unknown>).paidAmount === 'number'
      ? ((row as Record<string, unknown>).paidAmount as number) : 0;
    // Seulement plus de lignes, ou un total supérieur (jamais de diminution).
    if (payments.length === prev.length && (!withTotal || sum <= prevAmount)) return row;
    changed = true;
    // Sans total figé (hospit/bloc : calculé à la volée) → union seule, aucun champ ajouté.
    if (!withTotal) return { ...row, payments } as Rec;
    const total = typeof (row as Record<string, unknown>).totalAmount === 'number'
      ? ((row as Record<string, unknown>).totalAmount as number) : 0;
    const paidAmount = Math.max(prevAmount, sum);
    const next: Record<string, unknown> = { ...row, payments, paidAmount };
    if (typeof next.status === 'string' && (next.status === 'open' || next.status === 'partial' || next.status === 'paid')) {
      next.status = total > 0 && paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : next.status;
    }
    return next as Rec;
  });
  return changed ? out : mergedRows;
}

/**
 * Réconcilie l'état complet du poste avec l'état lu dans MySQL.
 * `currentUser` (session locale) n'est JAMAIS remplacé.
 * `onlyLists` : fusion sélective — seules ces collections sont réconciliées
 * (les autres gardent leur référence locale, sans aucun coût).
 */
export function mergeStates(base: AppState | null, local: AppState, remote: AppState, onlyLists?: readonly string[]): AppState {
  const merged: Record<string, unknown> = { ...local };
  const baseRec = (base || {}) as unknown as Record<string, unknown>;
  const localRec = local as unknown as Record<string, unknown>;
  const remoteRec = remote as unknown as Record<string, unknown>;
  const only = onlyLists ? new Set<string>(onlyLists) : null;

  for (const key of MERGEABLE_LISTS) {
    merged[key] = (!only || only.has(key))
      ? mergeList(base ? baseRec[key] : undefined, localRec[key], remoteRec[key])
      : localRec[key];
  }

  // Paiements imbriqués : union par id (jamais de règlement perdu).
  if (!only || only.has('companyBillingAccounts')) {
    merged.companyBillingAccounts = unionNestedPayments(
      asList(merged.companyBillingAccounts), asList(localRec.companyBillingAccounts),
      asList(remoteRec.companyBillingAccounts), true,
    );
  }
  if (!only || only.has('hbRecords')) {
    // Les dossiers hospit/bloc n'ont pas de total figé (calculé à la volée) :
    // l'union suffit, `paidAmount` virtuel reste à 0.
    merged.hbRecords = unionNestedPayments(
      asList(merged.hbRecords), asList(localRec.hbRecords),
      asList(remoteRec.hbRecords), false,
    );
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

  // Prescripteurs externes (ventes) : union sans doublon (casse ignorée),
  // chaque poste conserve ses ajouts et récupère ceux de l'autre.
  const unionNoms = (a: unknown, b: unknown): string[] => {
    const vus = new Set<string>();
    const out: string[] = [];
    for (const brut of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
      if (typeof brut !== 'string') continue;
      const nom = brut.trim();
      const cle = nom.toUpperCase();
      if (!nom || vus.has(cle)) continue;
      vus.add(cle);
      out.push(nom);
    }
    return out;
  };
  merged.prescripteursExternes = unionNoms(localRec.prescripteursExternes, remoteRec.prescripteursExternes);

  if (remote.assuranceStorageSupported !== undefined) merged.assuranceStorageSupported = remote.assuranceStorageSupported;

  merged.monthlyInvoices = preserveMonthlyInvoices(remote.monthlyInvoices, local.monthlyInvoices);

  // La session du poste reste celle de l'utilisateur connecté ici.
  merged.currentUser = localRec.currentUser ?? null;

  // Les lignes de paiement font foi : les en-têtes de ventes concurrents sont réparés.
  return repairVenteHeaders(syncSharedInvoiceBalances(merged as unknown as AppState));
}

/** Vrai si la fusion n'a rien changé pour ce poste (évite un re-rendu inutile). */
export function sameBusinessData(a: AppState, b: AppState): boolean {
  if (a === b) return true;
  if (a.monthlyInvoices !== b.monthlyInvoices
    && stable(a.monthlyInvoices || []) !== stable(b.monthlyInvoices || [])) return false;
  if (a.assuranceStorageSupported !== b.assuranceStorageSupported) return false;
  const aRec = a as unknown as Record<string, unknown>;
  const bRec = b as unknown as Record<string, unknown>;
  for (const key of MERGEABLE_LISTS) {
    // Même référence = identique : aucun stringify (cas général après fusion).
    if (aRec[key] === bRec[key]) continue;
    if (stable(aRec[key]) !== stable(bRec[key])) return false;
  }
  if (aRec.ticketSettings !== bRec.ticketSettings
    && stable(aRec.ticketSettings) !== stable(bRec.ticketSettings)) return false;
  for (const key of COUNTER_KEYS) {
    if (aRec[key] !== bRec[key]) return false;
  }
  if (a.lastBackupAt !== b.lastBackupAt || a.lastBackupBy !== b.lastBackupBy) return false;
  if (stable(a.prescripteursExternes || []) !== stable(b.prescripteursExternes || [])) return false;
  if (stable(a.issuedFactureNumbers || []) !== stable(b.issuedFactureNumbers || [])) return false;
  return true;
}

/**
 * Vrai si deux états partagent les mêmes références de premier niveau
 * (aucune modification métier). O(1) par collection — la session locale
 * (`currentUser`) est ignorée car jamais persistée.
 */
export function sameRefs(a: AppState, b: AppState | null): boolean {
  if (!b) return false;
  if (a === b) return true;
  const aRec = a as unknown as Record<string, unknown>;
  const bRec = b as unknown as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(aRec), ...Object.keys(bRec)]);
  for (const key of keys) {
    if (key === 'currentUser') continue;
    if (aRec[key] !== bRec[key]) return false;
  }
  return true;
}

/**
 * Clés de premier niveau modifiées entre deux états (comparaison par
 * référence, session exclue). Retourne `null` sans état de référence
 * (tout doit être envoyé).
 */
export function changedTopKeys(a: AppState, b: AppState | null): string[] | null {
  if (!b) return null;
  if (a === b) return [];
  const aRec = a as unknown as Record<string, unknown>;
  const bRec = b as unknown as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(aRec), ...Object.keys(bRec)]);
  const out: string[] = [];
  for (const key of keys) {
    if (key === 'currentUser') continue;
    if (aRec[key] !== bRec[key]) out.push(key);
  }
  return out;
}
