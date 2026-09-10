import { DEFAULT_TICKET_SETTINGS, type AppState } from './store';
import type { TicketSettings } from './types';
import { collectDeletions, mergeStates, sameBusinessData } from './syncMerge';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MODE WAMP — DONNÉES DANS MySQL (tables normalisées)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ce module est compilé uniquement dans la version WAMP (`npm run build:wamp`,
 *  variable `VITE_WAMP_MODE=1`). Dans cette version :
 *
 *   • Au démarrage, l'application charge SON ÉTAT COMPLET depuis MySQL
 *     (tables normalisées en français, via `api/index.php?action=read_all`) ;
 *   • À CHAQUE modification, l'état complet est automatiquement ré-enregistré
 *     dans les tables MySQL normalisées (`api/index.php?action=sync_all`) —
 *     patients, consultations, ventes, articles, messagerie, journal d'audit… ;
 *   • Aucune donnée applicative n'est conservée dans localStorage ou un fichier.
 *
 *  Les collections de l'application sont stockées UNE table par entité
 *  (`patients`, `ventes`, ...) — cf. WAMP/database/reception_salfa.sql.
 *
 *  Dans le build standard (développement / Cloudflare), ce module est inactif
 *  et l'application conserve son comportement mémoire d'origine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Vrai uniquement dans le build WAMP compilé avec VITE_WAMP_MODE=1 */
export const IS_WAMP_BUILD: boolean = import.meta.env.VITE_WAMP_MODE === '1';

/** URL relative de l'API d'état MySQL (identique pour http://localhost/reception-salfa/) */
const API_URL = 'api/index.php';

/** Collections « liste » persistées dans MySQL (clé = nom de dataset). */
const LIST_DATASETS: (keyof AppState)[] = [
  'assuranceSocietes', 'assurancePersonnes', 'assuranceFamilles', 'assurancePrestations', 'assurancePaiements',
  'patients', 'consultations', 'invoices', 'ventes', 'venteLines', 'ventePayments',
  'labRequests', 'journey', 'pharmaDeliveryItems', 'stockEntries', 'stockTransfers',
  'stockMovements', 'movementHeaders', 'movementLines', 'companyBillingAccounts',
  'hbRecords', 'messages', 'notifications', 'cashClosings', 'auditLogs',
  'inventorySessions', 'pharmaDeliveryClosings', 'users', 'companies', 'articles',
  'fournisseurs', 'familles', 'labCatalog', 'warehouseServices', 'etablissements',
];

/** Compteurs scalaires persistés dans la table compteurs. */
const COUNTER_KEYS: (keyof AppState)[] = ['factureCounter', 'pharmaClosingCounter'];

export interface WampSyncState {
  /** Le build courant est un build WAMP (MySQL actif) */
  enabled: boolean;
  /** Chargement initial depuis MySQL en cours */
  loading: boolean;
  /** Un état a été lu/écrit avec succès dans MySQL */
  usingMysql: boolean;
  /** Sauvegarde MySQL en cours */
  syncing: boolean;
  /** Horodatage de la dernière sauvegarde MySQL réussie */
  lastSavedAt: number | null;
  /** Dernière erreur de synchronisation (null si tout va bien) */
  error: string | null;
}

export const initialWampSync: WampSyncState = {
  enabled: IS_WAMP_BUILD,
  loading: IS_WAMP_BUILD,
  usingMysql: false,
  syncing: false,
  lastSavedAt: null,
  error: null,
};

/** Dernier état confirmé côté MySQL pour CE poste (base de la fusion à 3 versions). */
let lastConfirmedState: AppState | null = null;

/** Mémorise l'état considéré comme « déjà en base » pour ce poste. */
export function setSyncBaseline(state: AppState | null): void {
  lastConfirmedState = state ? (JSON.parse(JSON.stringify({ ...state, currentUser: null })) as AppState) : null;
}

/** Construit le payload `datasets` (état complet SANS la session courante). */
function buildDatasets(state: AppState): Record<string, unknown> {
  const datasets: Record<string, unknown> = {};
  for (const key of LIST_DATASETS) {
    // Older PHP deployments must keep accepting the original Caisse payload.
    if (key.startsWith('assurance') && !state.assuranceStorageSupported) continue;
    datasets[key] = (state as unknown as Record<string, unknown>)[key] ?? [];
  }
  datasets.ticketSettings = state.ticketSettings;
  for (const key of COUNTER_KEYS) {
    datasets[key] = (state as unknown as Record<string, unknown>)[key] ?? 0;
  }
  return datasets;
}

/** Reconstruit l'état applicatif complet depuis les datasets renvoyés par MySQL.
 *  Aucune donnée JSON de démonstration : seul MySQL (et les valeurs par défaut
 *  codées en dur ci-dessous) alimente l'état. */
function reconstructState(datasets: Record<string, unknown>): AppState {
  const state: Record<string, unknown> = { currentUser: null, assuranceStorageSupported: ['assuranceSocietes', 'assurancePersonnes', 'assuranceFamilles', 'assurancePrestations', 'assurancePaiements'].every(key => Array.isArray(datasets[key])) };
  for (const key of LIST_DATASETS) {
    const value = datasets[key];
    state[key] = Array.isArray(value) ? value : [];
  }
  state.monthlyInvoices = Array.isArray(datasets.monthlyInvoices) ? datasets.monthlyInvoices : [];
  state.ticketSettings = (datasets.ticketSettings as TicketSettings | undefined)
    ?? JSON.parse(JSON.stringify(DEFAULT_TICKET_SETTINGS));
  for (const key of COUNTER_KEYS) {
    state[key] = typeof datasets[key] === 'number' ? (datasets[key] as number) : 0;
  }
  return state as unknown as AppState;
}

/**
 * Charge l'état complet de l'application depuis MySQL (tables normalisées).
 * @returns l'état stocké, ou null si la base est vide / indisponible.
 */
export async function loadStateFromMysql(): Promise<AppState | null> {
  if (!IS_WAMP_BUILD) return null;
  try {
    const res = await fetch(`${API_URL}?action=read_all`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success === true && data.datasets) {
      // Base vraiment vierge (aucun compte ET aucun patient ET aucune vente) :
      // on laisse l'app écrire l'état initial. Sinon, on charge la base existante
      // sans jamais écraser des données déjà présentes.
      const noUsers = !Array.isArray(data.datasets.users) || data.datasets.users.length === 0;
      const noPatients = !Array.isArray(data.datasets.patients) || data.datasets.patients.length === 0;
      const noVentes = !Array.isArray(data.datasets.ventes) || data.datasets.ventes.length === 0;
      if (noUsers && noPatients && noVentes) {
        return null;
      }
      return reconstructState(data.datasets as Record<string, unknown>);
    }
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Impossible de charger l’état depuis MySQL :', e);
    return null;
  }
}

/**
 * Enregistre l'état complet dans les tables MySQL normalisées.
 * La session en cours (`currentUser`) n'est volontairement PAS persistée :
 * à chaque ouverture de l'application, la connexion repart de l'écran de login.
 * @returns true si la sauvegarde a réussi.
 */
export async function saveStateToMysql(state: AppState): Promise<boolean> {
  if (!IS_WAMP_BUILD) return false;
  try {
    const res = await fetch(`${API_URL}?action=sync_all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasets: buildDatasets(state) }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const ok = !!(data && data.success === true);
    if (ok) setSyncBaseline(state);
    return ok;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Échec de la sauvegarde MySQL :', e);
    return false;
  }
}

export interface SyncResult {
  /** L'échange avec MySQL a abouti. */
  ok: boolean;
  /**
   * État à appliquer au poste : fusion des saisies locales et de celles des
   * autres postes. `null` si rien n'a changé pour ce poste.
   */
  merged: AppState | null;
}

/**
 * ─── SYNCHRONISATION MULTI-POSTES ───
 * Enregistre les saisies de CE poste ET récupère celles des autres postes,
 * en une seule opération :
 *
 *   1. lecture de l'état courant en base (saisies des collègues) ;
 *   2. fusion à trois versions (base confirmée / local / distant) : aucune
 *      saisie n'est écrasée, les suppressions locales sont respectées ;
 *   3. écriture de l'état fusionné, avec la liste explicite des suppressions.
 *
 * C'est ce mécanisme qui fait remonter les consultations validées par le
 * médecin dans la file d'attente de la caisse, sans que la caisse n'écrase
 * en retour le travail du médecin.
 */
export async function syncStateWithMysql(state: AppState): Promise<SyncResult> {
  if (!IS_WAMP_BUILD) return { ok: false, merged: null };
  try {
    const res = await fetch(`${API_URL}?action=read_all`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, merged: null };
    const data = await res.json();
    if (!data || data.success !== true || !data.datasets) return { ok: false, merged: null };

    const remote = reconstructState(data.datasets as Record<string, unknown>);
    const merged = mergeStates(lastConfirmedState, state, remote);
    const deletions = collectDeletions(lastConfirmedState, state);
    if (!merged.assuranceStorageSupported) {
      for (const key of Object.keys(deletions)) if (key.startsWith('assurance')) delete deletions[key];
    }

    const saveRes = await fetch(`${API_URL}?action=sync_all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasets: buildDatasets(merged), deletions }),
    });
    if (!saveRes.ok) return { ok: false, merged: null };
    const saveData = await saveRes.json();
    if (!saveData || saveData.success !== true) return { ok: false, merged: null };

    setSyncBaseline(merged);
    // Rien de neuf pour ce poste : on évite un re-rendu inutile de l'interface.
    return { ok: true, merged: sameBusinessData(state, merged) ? null : merged };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Échec de la synchronisation :', e);
    return { ok: false, merged: null };
  }
}

/**
 * Rafraîchissement seul (lecture) : récupère les saisies des autres postes sans
 * rien écrire. Utilisé par le rafraîchissement périodique quand ce poste n'a
 * aucune modification en attente.
 */
export async function refreshStateFromMysql(state: AppState): Promise<AppState | null> {
  if (!IS_WAMP_BUILD) return null;
  try {
    const res = await fetch(`${API_URL}?action=read_all`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.success !== true || !data.datasets) return null;
    const remote = reconstructState(data.datasets as Record<string, unknown>);
    const merged = mergeStates(lastConfirmedState, state, remote);
    if (sameBusinessData(state, merged)) return null;
    return merged;
  } catch {
    return null;
  }
}

/**
 * Sauvegarde de secours utilisée à la fermeture de l'onglet (pagehide /
 * beforeunload) afin de ne perdre AUCUNE modification : envoi du dernier état
 * connu vers MySQL via `navigator.sendBeacon` (POST accepté par api/index.php).
 */
export function flushStateToMysql(state: AppState): void {
  if (!IS_WAMP_BUILD) return;
  try {
    const blob = new Blob([JSON.stringify({ datasets: buildDatasets(state) })], {
      type: 'application/json',
    });
    navigator.sendBeacon(`${API_URL}?action=sync_all`, blob);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Envoi final impossible :', e);
  }
}
