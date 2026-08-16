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
    return true;
  } catch (error) {
    console.warn('[Navigateur/IndexedDB] Écriture impossible, utilisation du repli local :', error);
    return fallbackSave(state);
  }
}
