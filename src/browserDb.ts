import type { AppState } from './store';

/**
 * Stockage hors WAMP : la base reste dans le navigateur de l'utilisateur.
 * IndexedDB supporte des volumes plus importants que localStorage (notamment les
 * logos) et ne transmet aucune donnée à un serveur. localStorage ne sert que de
 * solution de secours lorsqu'IndexedDB est indisponible.
 */
const DB_NAME = 'reception-salfa';
const DB_VERSION = 1;
const STORE_NAME = 'application';
const STATE_KEY = 'state';
const FALLBACK_KEY = 'reception_salfa_state_v1';
/** Canal de synchronisation entre onglets/fenêtres du même navigateur */
const SYNC_CHANNEL = 'reception-salfa-sync';
/** Clé « ping » localStorage : déclenche l'évènement `storage` dans les AUTRES onglets */
const SYNC_PING_KEY = 'reception_salfa_sync_ping';

/** Identifiant unique de cet onglet (évite de réagir à ses propres écritures). */
export const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type StoredRecord = {
  state: AppState;
  savedAt: number;
};

function stateForStorage(state: AppState): AppState {
  // La session n'est jamais restaurée : l'utilisateur doit se reconnecter après
  // avoir fermé l'application, alors que toutes les données métier restent là.
  return { ...state, currentUser: null };
}

function isStoredRecord(value: unknown): value is StoredRecord {
  return !!value && typeof value === 'object' && 'state' in value;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Ouverture IndexedDB impossible'));
  });
}

function fallbackLoad(): AppState | null {
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isStoredRecord(value) ? { ...value.state, currentUser: null } : null;
  } catch {
    return null;
  }
}

function fallbackSave(state: AppState): boolean {
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify({ state: stateForStorage(state), savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Charge l'état complet depuis la base IndexedDB du navigateur. */
export async function loadStateFromBrowser(): Promise<AppState | null> {
  try {
    const db = await openDatabase();
    return await new Promise<AppState | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => {
        const value: unknown = request.result;
        resolve(isStoredRecord(value) ? { ...value.state, currentUser: null } : null);
      };
      request.onerror = () => reject(request.error || new Error('Lecture IndexedDB impossible'));
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    // Le repli garde l'application utilisable dans les navigateurs très limités.
    console.warn('[Navigateur/IndexedDB] Lecture impossible, utilisation du repli local :', error);
    return fallbackLoad();
  }
}

/** Enregistre l'état complet dans la base IndexedDB du navigateur. */
export async function saveStateToBrowser(state: AppState): Promise<boolean> {
  const record: StoredRecord = { state: stateForStorage(state), savedAt: Date.now() };
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record, STATE_KEY);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error || new Error('Écriture IndexedDB impossible'));
      transaction.onabort = () => reject(transaction.error || new Error('Écriture IndexedDB annulée'));
    });
    notifyBrowserStateSaved();
    return true;
  } catch (error) {
    console.warn('[Navigateur/IndexedDB] Écriture impossible, utilisation du repli local :', error);
    const ok = fallbackSave(state);
    if (ok) notifyBrowserStateSaved();
    return ok;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  SYNCHRONISATION ENTRE ONGLETS / FENÊTRES (mode navigateur, hors WAMP)
 *  ---------------------------------------------------------------------------
 *  Réception, médecin, caisse… sont souvent ouverts dans des onglets (ou des
 *  fenêtres) différents du même navigateur. Chaque onglet gardait son état en
 *  mémoire et réécrivait la base : les saisies de la réception n'arrivaient
 *  jamais chez le médecin. On prévient donc les autres onglets à chaque
 *  écriture, et chacun relit puis fusionne la base.
 * ───────────────────────────────────────────────────────────────────────────*/

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try { channel = new BroadcastChannel(SYNC_CHANNEL); } catch { channel = null; }
  }
  return channel;
}

/** Prévient les autres onglets qu'une nouvelle version de la base est disponible. */
export function notifyBrowserStateSaved(): void {
  try { getChannel()?.postMessage({ type: 'state-saved', tabId: TAB_ID, at: Date.now() }); } catch { /* ignoré */ }
  // Repli (et navigateurs sans BroadcastChannel) : l'évènement `storage` n'est
  // émis que dans les AUTRES onglets, exactement ce dont on a besoin.
  try { window.localStorage.setItem(SYNC_PING_KEY, `${TAB_ID}:${Date.now()}`); } catch { /* ignoré */ }
}

/** S'abonne aux notifications d'écriture émises par les autres onglets. */
export function subscribeBrowserState(onRemoteSave: () => void): () => void {
  const ch = getChannel();
  const onMessage = (e: MessageEvent) => {
    const data = e.data as { type?: string; tabId?: string } | null;
    if (!data || data.type !== 'state-saved' || data.tabId === TAB_ID) return;
    onRemoteSave();
  };
  ch?.addEventListener('message', onMessage);

  const onStorage = (e: StorageEvent) => {
    if (e.key !== SYNC_PING_KEY || !e.newValue) return;
    if (e.newValue.startsWith(`${TAB_ID}:`)) return;
    onRemoteSave();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    ch?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}
