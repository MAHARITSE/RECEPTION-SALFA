import type { AppState } from './store';
import { reorganizeFamilyMetadata } from './modules/assurance/billingFamilyRepair';
import { billingFacility, collectBillingDocuments, documentsForScope, monthlyScopeId, createMonthlyInvoice, preserveMonthlyInvoices, type MonthlyInvoice, type MonthlyScope } from './modules/assurance/monthlyBilling';
import { changedTopKeys } from './syncMerge';
import {
  nextDailySequence, nextSocieteSequence,
  formatDailyFactureNumber, formatSocieteFactureNumber,
} from './utils/factureNumber';

/**
 * Stockage hors WAMP : la base reste dans le navigateur de l'utilisateur.
 * IndexedDB supporte des volumes plus importants que localStorage (notamment les
 * logos) et ne transmet aucune donnée à un serveur. localStorage ne sert que de
 * solution de secours lorsqu'IndexedDB est indisponible.
 *
 * LAYOUT v2 (différentiel) : UN enregistrement par collection (`ds:patients`,
 * `ds:ventes`…) + un enregistrement `meta` ({savedAt, tabId}). Chaque
 * sauvegarde n'écrit que les collections MODIFIÉES (comparaison par référence)
 * au lieu de re-sérialiser toute la base ; chaque rafraîchissement lit d'abord
 * le seul `meta` (quelques octets) et ne recharge que s'il a changé.
 * L'ancien enregistrement unique v1 est migré automatiquement à l'ouverture.
 */
const DB_NAME = 'reception-salfa';
const DB_VERSION = 2;
const STORE_NAME = 'app';
const LEGACY_STORE = 'application';
const LEGACY_KEY = 'state';
const META_KEY = 'meta';
const FALLBACK_KEY = 'reception_salfa_state_v1';
/** Canal de synchronisation entre onglets/fenêtres du même navigateur */
const SYNC_CHANNEL = 'reception-salfa-sync';
/** Clé « ping » localStorage : déclenche l'évènement `storage` dans les AUTRES onglets */
const SYNC_PING_KEY = 'reception_salfa_sync_ping';

const dsKey = (name: string): string => `ds:${name}`;
const seqKey = (kind: string, period: string): string => `seq:${kind}:${period}`;

/** Identifiant unique de cet onglet (évite de réagir à ses propres écritures). */
export const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface BrowserMeta {
  savedAt: number;
  tabId: string;
}

type StoredValue = {
  v: unknown;
  savedAt: number;
};

type LegacyRecord = {
  state: AppState;
  savedAt: number;
};

export interface SequenceRequest {
  kind: 'standard' | 'societe';
  /** Période : AAMMJJ (standard) ou AAMM (société, mois des prescriptions). */
  period: string;
  date: Date;
  code?: string;
}

function isStoredValue(value: unknown): value is StoredValue {
  return !!value && typeof value === 'object' && 'v' in value;
}

function isLegacyRecord(value: unknown): value is LegacyRecord {
  return !!value && typeof value === 'object' && 'state' in value;
}

function isBrowserMeta(value: unknown): value is BrowserMeta {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return typeof m.savedAt === 'number' && typeof m.tabId === 'string';
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
      const tx = request.transaction;
      if (!tx) return;
      let app: IDBObjectStore;
      if (db.objectStoreNames.contains(STORE_NAME)) app = tx.objectStore(STORE_NAME);
      else app = db.createObjectStore(STORE_NAME);
      // Migration v1 → v2 : l'enregistrement unique est éclaté par collection,
      // dans la même transaction (atomique : tout ou rien).
      if (db.objectStoreNames.contains(LEGACY_STORE)) {
        const ancien = tx.objectStore(LEGACY_STORE);
        const lecture = ancien.get(LEGACY_KEY);
        lecture.onsuccess = () => {
          try {
            const val: unknown = lecture.result;
            if (isLegacyRecord(val)) {
              const at = val.savedAt || Date.now();
              for (const [k, v] of Object.entries(val.state)) {
                if (k === 'currentUser') continue;
                app.put({ v, savedAt: at } as StoredValue, dsKey(k));
              }
              app.put({ savedAt: at, tabId: 'migration-v2' } as BrowserMeta, META_KEY);
            }
          } catch {
            // Base illisible : on repart proprement (l'ancien magasin est retiré).
          }
          db.deleteObjectStore(LEGACY_STORE);
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Ouverture IndexedDB impossible'));
  });
}

/** Lit toutes les paires clé/valeur d'un magasin (curseur). */
function collectAll(store: IDBObjectStore): Promise<Map<string, unknown>> {
  return new Promise((resolve, reject) => {
    const map = new Map<string, unknown>();
    let request: IDBRequest<IDBCursorWithValue | null>;
    try {
      request = store.openCursor();
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(map);
        return;
      }
      map.set(String(cursor.key), cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('Lecture IndexedDB impossible'));
  });
}

/** Reassemble l'état depuis les enregistrements `ds:*`. `null` si base vide. */
function assembleState(data: Map<string, unknown>): AppState | null {
  const state: Record<string, unknown> = { currentUser: null };
  let found = false;
  for (const [key, value] of data) {
    if (!key.startsWith('ds:') || !isStoredValue(value)) continue;
    state[key.slice(3)] = value.v;
    found = true;
  }
  return found ? (state as unknown as AppState) : null;
}

function fallbackLoad(): AppState | null {
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isLegacyRecord(value) ? { ...value.state, currentUser: null } : null;
  } catch {
    return null;
  }
}

function fallbackSave(state: AppState): boolean {
  try {
    const { currentUser: _session, ...rest } = state as AppState & { currentUser: unknown };
    void _session;
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify({
      state: { ...rest, monthlyInvoices: preserveMonthlyInvoices(fallbackLoad()?.monthlyInvoices, state.monthlyInvoices) },
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

/** Lit le seul enregistrement `meta` (quelques octets) : le rafraîchissement périodique ne coûte presque rien. */
export async function readBrowserMeta(): Promise<BrowserMeta | null> {
  try {
    const db = await openDatabase();
    try {
      const value: unknown = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(META_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Lecture méta impossible'));
      });
      return isBrowserMeta(value) ? value : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Charge l'état complet depuis la base IndexedDB du navigateur. */
export async function loadStateFromBrowser(): Promise<AppState | null> {
  try {
    const db = await openDatabase();
    try {
      return await new Promise<AppState | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let result: AppState | null = null;
        let failure: unknown;
        let wroteMigration = false;
        collectAll(store).then(
          (data) => {
            try {
              const assembled = assembleState(data);
              if (!assembled) return; // base vide → null (le seed sera écrit ensuite)
              result = reorganizeFamilyMetadata(assembled);
              if (result !== assembled) {
                // Normalisation : on ne réécrit que les collections concernées.
                const changed = changedTopKeys(result, assembled) || [];
                const now = Date.now();
                const rec = result as unknown as Record<string, unknown>;
                for (const key of changed) store.put({ v: rec[key], savedAt: now } as StoredValue, dsKey(key));
                if (changed.length > 0) {
                  store.put({ savedAt: now, tabId: TAB_ID } as BrowserMeta, META_KEY);
                  wroteMigration = true;
                }
              }
            } catch (error) {
              failure = error;
              try { tx.abort(); } catch { /* déjà annulée */ }
            }
          },
          (error) => {
            failure = error;
            try { tx.abort(); } catch { /* déjà annulée */ }
          },
        );
        tx.oncomplete = () => {
          if (wroteMigration) notifyBrowserStateSaved();
          resolve(result);
        };
        tx.onabort = () => reject(failure || tx.error || new Error('Lecture IndexedDB impossible'));
        tx.onerror = () => { failure = failure || tx.error; };
      });
    } finally {
      db.close();
    }
  } catch (error) {
    // Le repli garde l'application utilisable dans les navigateurs très limités.
    console.warn('[Navigateur/IndexedDB] Lecture impossible, utilisation du repli local :', error);
    return fallbackLoad();
  }
}

/**
 * Enregistre l'état dans IndexedDB — UNIQUEMENT les collections modifiées
 * depuis `prevState` (comparaison par référence). Sans état précédent, tout
 * est écrit (première sauvegarde). Si rien n'a changé, rien n'est écrit :
 * le `meta` n'est pas touché et les autres onglets ne rechargent pas.
 */
export async function saveStateToBrowser(state: AppState, prevState: AppState | null = null): Promise<boolean> {
  try {
    const db = await openDatabase();
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let failure: unknown;
        let wrote = false;
        const readPrev = store.get(dsKey('monthlyInvoices'));
        readPrev.onsuccess = () => {
          try {
            const storedMI = isStoredValue(readPrev.result) && Array.isArray(readPrev.result.v)
              ? (readPrev.result.v as MonthlyInvoice[]) : [];
            const normalized = reorganizeFamilyMetadata({
              ...state,
              monthlyInvoices: preserveMonthlyInvoices(storedMI, state.monthlyInvoices),
            });
            const changed = changedTopKeys(normalized, prevState);
            const rec = normalized as unknown as Record<string, unknown>;
            const keys = changed === null
              ? Object.keys(rec).filter((k) => k !== 'currentUser')
              : changed;
            if (keys.length === 0) return; // rien à écrire
            const now = Date.now();
            for (const key of keys) store.put({ v: rec[key], savedAt: now } as StoredValue, dsKey(key));
            store.put({ savedAt: now, tabId: TAB_ID } as BrowserMeta, META_KEY);
            wrote = true;
          } catch (error) {
            failure = error;
            try { tx.abort(); } catch { /* déjà annulée */ }
          }
        };
        readPrev.onerror = () => {
          failure = readPrev.error;
          try { tx.abort(); } catch { /* déjà annulée */ }
        };
        tx.oncomplete = () => {
          if (wrote) notifyBrowserStateSaved();
          resolve(true);
        };
        tx.onabort = () => reject(failure || tx.error || new Error('Écriture IndexedDB annulée'));
        tx.onerror = () => { failure = failure || tx.error; };
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[Navigateur/IndexedDB] Écriture impossible, utilisation du repli local :', error);
    const ok = fallbackSave(state);
    if (ok) notifyBrowserStateSaved();
    return ok;
  }
}

/**
 * Alloue des numéros d'ordre de facture de façon ATOMIQUE (une seule
 * transaction : deux onglets n'obtiennent jamais le même numéro).
 * Au premier usage d'une période, la séquence est amorcée depuis l'historique
 * COMPLET (numéros fournis + collections relues dans cette même transaction,
 * ce qui couvre les autres onglets pas encore synchronisés) ; ensuite,
 * simple incrément O(1) — plus aucun balayage.
 * @returns les numéros d'ordre attribués, dans l'ordre des demandes.
 */
export async function allocateBrowserSequences(items: SequenceRequest[], seedNumbers: string[]): Promise<number[]> {
  const db = await openDatabase();
  try {
    return await new Promise<number[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const seqs: number[] = new Array(items.length);
      const numbers = [...seedNumbers];
      let failure: unknown;
      const fail = (error: unknown): void => {
        failure = error;
        try { tx.abort(); } catch { /* déjà annulée */ }
      };
      // Collections porteuses de numéros : relues AVANT tout amorçage.
      const SCAN = ['ventes', 'invoices', 'hbRecords', 'assurancePrestations', 'issuedFactureNumbers'];
      const scanStored = (i: number): void => {
        if (i >= SCAN.length) { step(0); return; }
        const request = store.get(dsKey(SCAN[i]));
        request.onsuccess = () => {
          try {
            const v = request.result;
            if (isStoredValue(v) && Array.isArray(v.v)) {
              for (const row of v.v as unknown[]) {
                if (typeof row === 'string') {
                  if (row) numbers.push(row);
                } else if (row && typeof row === 'object') {
                  const n = (row as Record<string, unknown>).numeroFacture;
                  if (typeof n === 'string' && n) numbers.push(n);
                }
              }
            }
          } catch {
            // Collection illisible : on continue avec l'historique fourni.
          }
          scanStored(i + 1);
        };
        // Lecture impossible → on annule tout : attribuer depuis un
        // historique partiel risquerait un doublon. Mieux vaut une erreur
        // visible qu'une facture en double.
        request.onerror = () => fail(request.error);
      };
      const step = (i: number): void => {
        if (i >= items.length) return; // la transaction se valide
        const item = items[i];
        const request = store.get(seqKey(item.kind, item.period));
        request.onsuccess = () => {
          try {
            const stored = request.result;
            const prev = isStoredValue(stored) && typeof stored.v === 'number' ? stored.v : null;
            // Série en cours : +1. Nouvelle période : max(historique) + 1, une seule fois.
            const next = prev !== null
              ? prev + 1
              : item.kind === 'standard'
                ? nextDailySequence(numbers, item.date)
                : nextSocieteSequence(numbers, item.code || 'SOC', item.date);
            store.put({ v: next, savedAt: Date.now() } as StoredValue, seqKey(item.kind, item.period));
            numbers.push(item.kind === 'standard'
              ? formatDailyFactureNumber(item.date, next)
              : formatSocieteFactureNumber(item.date, item.code || 'SOC', next));
            seqs[i] = next;
            step(i + 1);
          } catch (error) {
            fail(error);
          }
        };
        request.onerror = () => fail(request.error);
      };
      scanStored(0);
      tx.oncomplete = () => resolve(seqs);
      tx.onabort = () => reject(failure || tx.error || new Error('Numérotation impossible.'));
      tx.onerror = () => { failure = failure || tx.error; };
    });
  } finally {
    db.close();
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

/** The snapshot and its month sequence are created in ONE read/write transaction.
 * Resolve only after commit; never open the printer on a failed write. There is
 * deliberately no non-atomic localStorage fallback for financial issuance. */
export async function issueMonthlyInvoiceInBrowser(current: AppState, scope: MonthlyScope): Promise<MonthlyInvoice> {
  const db = await openDatabase();
  try {
    const invoice = await new Promise<MonthlyInvoice>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let result: MonthlyInvoice | undefined;
      let failure: unknown;
      collectAll(store).then(
        (data) => {
          try {
            const stored = assembleState(data);
            if (!stored) throw new Error('La base doit être chargée et enregistrée avant émission.');
            const source = reorganizeFamilyMetadata({
              ...stored,
              currentUser: current.currentUser,
              monthlyInvoices: preserveMonthlyInvoices(stored.monthlyInvoices, current.monthlyInvoices),
            });
            const archive = source.monthlyInvoices || [];
            if (!archive.some(i => i.id === monthlyScopeId(scope))) {
              const scoped = (s: AppState) => JSON.stringify(documentsForScope(collectBillingDocuments(s), scope));
              if (scoped(source) !== scoped(current) || JSON.stringify(billingFacility(source)) !== JSON.stringify(billingFacility(current))) {
                throw new Error('Enregistrement ou synchronisation des pièces en cours. Réessayez dans quelques secondes.');
              }
            }
            result = createMonthlyInvoice(source, scope, archive);
            const now = Date.now();
            store.put({ v: preserveMonthlyInvoices(archive, [result]), savedAt: now } as StoredValue, dsKey('monthlyInvoices'));
            store.put({ v: source.articles, savedAt: now } as StoredValue, dsKey('articles'));
            store.put({ savedAt: now, tabId: TAB_ID } as BrowserMeta, META_KEY);
          } catch (error) {
            failure = error;
            try { tx.abort(); } catch { /* déjà annulée */ }
          }
        },
        (error) => {
          failure = error;
          try { tx.abort(); } catch { /* déjà annulée */ }
        },
      );
      tx.oncomplete = () => {
        if (result) resolve(result);
        else reject(failure || new Error('Facture non enregistrée.'));
      };
      tx.onabort = () => reject(failure || tx.error || new Error('Facture non enregistrée.'));
      tx.onerror = () => { failure = failure || tx.error; };
    });
    notifyBrowserStateSaved();
    return invoice;
  } finally {
    db.close();
  }
}
