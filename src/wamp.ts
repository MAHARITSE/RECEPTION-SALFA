import type { AppState } from './store';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MODE WAMP — TOUTES LES DONNÉES DANS MySQL
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ce module est compilé uniquement dans la version WAMP (`npm run build:wamp`,
 *  variable `VITE_WAMP_MODE=1`). Dans cette version :
 *
 *   • Au démarrage, l'application charge SON ÉTAT COMPLET depuis MySQL
 *     (table `salfa_app_state`, via `api/state.php` en GET) ;
 *   • À CHAQUE modification, l'état complet est automatiquement ré-enregistré
 *     dans MySQL (PUT) — patients, consultations, factures, ventes, messages,
 *     journal d'audit, stocks… absolument tout ;
 *   • Aucune donnée applicative n'est conservée dans localStorage ou dans un
 *     fichier : le stockage unique et exclusif est MySQL.
 *
 *  Dans le build standard (développement / Cloudflare), ce module est inactif
 *  et l'application conserve son comportement mémoire d'origine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Vrai uniquement dans le build WAMP compilé avec VITE_WAMP_MODE=1 */
export const IS_WAMP_BUILD: boolean = import.meta.env.VITE_WAMP_MODE === '1';

/** URL relative de l'API d'état MySQL (identique pour localhost/reception-salfa/) */
const STATE_URL = 'api/state.php';

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

/**
 * Charge l'état complet de l'application depuis MySQL.
 * @returns l'état stocké, ou null si aucun état n'existe / base indisponible.
 */
export async function loadStateFromMysql(): Promise<AppState | null> {
  if (!IS_WAMP_BUILD) return null;
  try {
    const res = await fetch(STATE_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success === true && data.state) {
      return data.state as AppState;
    }
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Impossible de charger l’état depuis MySQL :', e);
    return null;
  }
}

/**
 * Enregistre l'état complet dans MySQL (table `salfa_app_state`).
 * La session en cours (`currentUser`) n'est volontairement PAS persistée :
 * à chaque ouverture de l'application, la connexion repart de l'écran de login.
 * @returns true si la sauvegarde a réussi.
 */
export async function saveStateToMysql(state: AppState): Promise<boolean> {
  if (!IS_WAMP_BUILD) return false;
  try {
    const { currentUser: _currentUser, ...persisted } = state;
    const res = await fetch(STATE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: persisted }),
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
 * connu vers MySQL via `navigator.sendBeacon` (POST accepté par api/state.php).
 */
export function flushStateToMysql(state: AppState): void {
  if (!IS_WAMP_BUILD) return;
  try {
    const { currentUser: _currentUser, ...persisted } = state;
    const blob = new Blob([JSON.stringify({ state: persisted })], {
      type: 'application/json',
    });
    navigator.sendBeacon(STATE_URL, blob);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Envoi final impossible :', e);
  }
}
