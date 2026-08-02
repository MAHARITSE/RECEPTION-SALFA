import { DEFAULT_TICKET_SETTINGS, type AppState } from './store';
import type { TicketSettings } from './types';

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
  'patients', 'consultations', 'invoices', 'ventes', 'venteLines', 'ventePayments',
  'labRequests', 'journey', 'pharmaDeliveryItems', 'stockEntries', 'stockTransfers',
  'stockMovements', 'movementHeaders', 'movementLines', 'companyBillingAccounts',
  'hbRecords', 'messages', 'notifications', 'cashClosings', 'auditLogs',
  'inventorySessions', 'pharmaDeliveryClosings', 'users', 'companies', 'articles',
  'fournisseurs', 'familles', 'labCatalog', 'warehouseServices',
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

/** Construit le payload `datasets` (état complet SANS la session courante). */
function buildDatasets(state: AppState): Record<string, unknown> {
  const datasets: Record<string, unknown> = {};
  for (const key of LIST_DATASETS) {
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
  const state: Record<string, unknown> = { currentUser: null };
  for (const key of LIST_DATASETS) {
    const value = datasets[key];
    state[key] = Array.isArray(value) ? value : [];
  }
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
    return !!(data && data.success === true);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Échec de la sauvegarde MySQL :', e);
    return false;
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
