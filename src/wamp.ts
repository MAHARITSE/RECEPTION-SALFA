import { DEFAULT_TICKET_SETTINGS, type AppState } from './store';
import type { TicketSettings, User } from './types';
import { collectDeletions, mergeStates, sameBusinessData } from './syncMerge';
import type { SequenceRequest } from './browserDb';

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

/* ── SESSION WAMP (jeton 12 h, mémoire seule : re-connexion à chaque rechargement) ── */
let sessionToken: string | null = null;
let unauthorizedListener: (() => void) | null = null;

/** Enregistre l'action à exécuter quand le serveur rejette la session (401). */
export function onWampUnauthorized(listener: () => void): void {
  unauthorizedListener = listener;
}

/** Oublie le jeton de session (déconnexion, session expirée ou refusée). */
export function clearWampSession(): void {
  sessionToken = null;
  lastConfirmedState = null;
}

/** Appel API authentifié : pose le jeton et signale les 401 (session expirée). */
async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (sessionToken) headers.set('X-Session-Token', sessionToken);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearWampSession();
    try { unauthorizedListener?.(); } catch { /* rappel applicatif : ne casse rien */ }
  }
  return res;
}

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
    // Les mots de passe ne quittent JAMAIS le poste (le serveur préserve ceux
    // en base ; changements via action=password, admin uniquement).
    if (key === 'users') {
      const rows = ((state as unknown as Record<string, unknown>)[key] as Record<string, unknown>[] | undefined) ?? [];
      datasets[key] = rows.map((u) => {
        const { password: _motDePasse, ...rest } = u;
        void _motDePasse;
        return rest;
      });
      continue;
    }
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
    const res = await apiFetch(`${API_URL}?action=read_all`, {
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
    const res = await apiFetch(`${API_URL}?action=sync_all`, {
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
    const res = await apiFetch(`${API_URL}?action=read_all`, {
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

    const saveRes = await apiFetch(`${API_URL}?action=sync_all`, {
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
    const res = await apiFetch(`${API_URL}?action=read_all`, {
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
    // sendBeacon ne peut pas poser d'en-tête : le jeton voyage dans le corps.
    const blob = new Blob([JSON.stringify({ datasets: buildDatasets(state), token: sessionToken })], {
      type: 'application/json',
    });
    navigator.sendBeacon(`${API_URL}?action=sync_all`, blob);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Envoi final impossible :', e);
  }
}

/**
 * ─── NUMÉROTATION ATOMIQUE MULTI-CAISSES ───
 * Réserve auprès de MySQL les ordres de facture du lot (`api/index.php`,
 * action `numero`, table `sequences`, verrou `SELECT … FOR UPDATE`) : deux
 * caisses n'obtiennent jamais le même numéro, même à la même seconde.
 * JETTE une erreur bloquante en cas d'échec : l'appelant doit alerter et
 * ne JAMAIS facturer sans numéro réservé.
 * @returns les ordres attribués, dans l'ordre des demandes.
 */
export async function allocateWampSequences(items: SequenceRequest[], seedNumbers: string[]): Promise<number[]> {
  if (!IS_WAMP_BUILD) throw new Error('Numérotation réseau indisponible hors WAMP.');
  let res: Response;
  try {
    res = await apiFetch(`${API_URL}?action=numero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((i) => ({ kind: i.kind, period: i.period })),
        seeds: seedNumbers,
      }),
    });
  } catch {
    throw new Error('Serveur injoignable : numérotation impossible. Vérifiez le réseau puis réessayez.');
  }
  if (!res.ok) {
    throw new Error(`Numérotation impossible (serveur : erreur ${res.status}). Aucune facture émise.`);
  }
  const data: unknown = await res.json().catch(() => null);
  const seqs = (data as { success?: boolean; seqs?: unknown } | null)?.success === true
    ? (data as { seqs?: unknown }).seqs
    : null;
  if (!Array.isArray(seqs) || seqs.length !== items.length || !seqs.every((s) => typeof s === 'number' && s >= 1)) {
    throw new Error('Numérotation impossible (réponse serveur invalide). Aucune facture émise.');
  }
  return seqs as number[];
}

/** Valide et normalise un compte renvoyé par le serveur (jamais de mot de passe). */
function asUser(obj: unknown): User | null {
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    role: (typeof r.role === 'string' ? r.role : 'receptionist') as User['role'],
    roles: Array.isArray(r.roles) ? (r.roles as User['role'][]) : undefined,
  };
}

/**
 * Liste PUBLIQUE des comptes (écran de connexion) : identifiants + rôles,
 * jamais de mot de passe. Jette une erreur si le serveur est injoignable.
 */
export async function fetchPublicUsers(): Promise<User[]> {
  if (!IS_WAMP_BUILD) throw new Error('Comptes réseau indisponibles hors WAMP.');
  let res: Response;
  try {
    res = await fetch(`${API_URL}?action=utilisateurs`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Serveur injoignable : vérifiez WAMP (icône verte) puis réessayez.');
  }
  if (!res.ok) throw new Error(`Comptes injoignables (serveur : erreur ${res.status}).`);
  const data: unknown = await res.json().catch(() => null);
  const list = (data as { success?: boolean; users?: unknown } | null)?.success === true
    ? (data as { users?: unknown }).users
    : null;
  if (!Array.isArray(list)) throw new Error('Réponse serveur invalide.');
  return list.map(asUser).filter((u): u is User => !!u);
}

/**
 * ─── AUTHENTIFICATION SERVEUR ───
 * Le mot de passe est vérifié en bcrypt côté MySQL (migration paresseuse
 * depuis les empreintes `sha256:` du client et l'historique en clair).
 * En cas de succès, mémorise le jeton de session (12 h) utilisé par tous
 * les appels suivants. Jette une erreur (message affichable) sinon.
 */
export async function loginToMysql(id: string, password: string): Promise<User> {
  if (!IS_WAMP_BUILD) throw new Error('Connexion réseau indisponible hors WAMP.');
  let res: Response;
  try {
    res = await fetch(`${API_URL}?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
  } catch {
    throw new Error('Serveur injoignable : vérifiez WAMP (icône verte) puis réessayez.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.status === 401) throw new Error('Identifiant ou mot de passe incorrect.');
  if (!res.ok) throw new Error(`Connexion impossible (serveur : erreur ${res.status}).`);
  const ok = (data as { success?: boolean } | null)?.success === true;
  const user = asUser((data as { user?: unknown } | null)?.user);
  const token = (data as { token?: unknown } | null)?.token;
  if (!ok || !user || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('Connexion impossible (réponse serveur invalide).');
  }
  sessionToken = token;
  return user;
}

/**
 * Redéfinit le mot de passe d'un compte (ADMINISTRATEUR connecté uniquement).
 * Seule écriture possible d'un mot de passe existant : bcrypt immédiat côté
 * serveur (sync_all préserve toujours celui en base).
 */
export async function setWampPassword(id: string, password: string): Promise<void> {
  if (!IS_WAMP_BUILD) throw new Error('Gestion réseau indisponible hors WAMP.');
  let res: Response;
  try {
    res = await apiFetch(`${API_URL}?action=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
  } catch {
    throw new Error('Serveur injoignable : mot de passe non modifié.');
  }
  if (res.status === 401) throw new Error('Session expirée : reconnectez-vous puis réessayez.');
  if (res.status === 403) throw new Error('Réservé à l’administrateur.');
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const msg = (data as { error?: unknown } | null)?.error;
    throw new Error(typeof msg === 'string' && msg ? msg : `Mot de passe non modifié (erreur ${res.status}).`);
  }
}
