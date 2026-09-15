import { DEFAULT_TICKET_SETTINGS, type AppState } from './store';
import type { TicketSettings, User } from './types';
import { changedTopKeys, collectDeletions, mergeStates, sameBusinessData } from './syncMerge';
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
  lastPushedRefs = null;
  lastRev = null;
  dernierEnvoiComplet = 0;
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

/** Révision de la base lue/écrite pour la dernière fois par CE poste
 *  (table `revision`, migration 003). `null` = serveur sans poll : on relit
 *  alors systématiquement tout l'état (comportement précédent, jamais perdu). */
let lastRev: number | null = null;

/** Copie de travail du dernier état confirmé (le clonage protège la fusion
 *  à trois versions des mutations en place du composant appelant). */
let lastPushedRefs: AppState | null = null;

/** Plein renouvellement de référence : après cet intervalle, un poste renvoie
 *  TOUT son état même sans changement de référence détecté. Filet de sécurité :
 *  un écran qui modifierait un objet en place (au lieu d'en recréer un neuf)
 *  serait sinon invisible de la comparaison différentielle. Coût : 1 gros envoi
 *  par poste et par 10 minutes au lieu d'un par frappe. */
const PLEIN_ENVOI_INTERVALE_MS = 10 * 60 * 1000;
let dernierEnvoiComplet = 0;

/** Mémorise l'état considéré comme « déjà en base » pour ce poste. */
export function setSyncBaseline(state: AppState | null): void {
  lastConfirmedState = state ? (JSON.parse(JSON.stringify({ ...state, currentUser: null })) as AppState) : null;
  // Référence conservée telle quelle : sert uniquement à décider QUOI envoyer
  // (les mises à jour de l'application créent des collections neuves).
  lastPushedRefs = state;
}

/** Révision connue du serveur (pour le contrôle d'anti-écrasement `if_rev`). */
export function getWampRev(): number | null { return lastRev; }

/** Sondage léger : la base a-t-elle changé depuis notre dernière lecture ?
 *  - `{ supported: true, changed: false }` → rien à relire (le cas fréquent) ;
 *  - `{ supported: false }` → serveur sans migration 003 : relecture complète ;
 *  - `{ ok: false }` → sonde impossible (réseau, session) : relecture complète. */
export async function pollWamp(): Promise<{ ok: boolean; supported: boolean; changed: boolean; rev: number | null }> {
  const aUCUNE_REF = { ok: true, supported: false, changed: true, rev: null };
  if (!IS_WAMP_BUILD) return { ...aUCUNE_REF, ok: false };
  try {
    const res = await apiFetch(`${API_URL}?action=poll`, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return { ...aUCUNE_REF, ok: false };
    const data = await res.json();
    if (!data || data.success !== true) return { ...aUCUNE_REF, ok: false };
    if (typeof data.rev !== 'number') return aUCUNE_REF; // serveur pré-v3
    const changed = lastRev === null || data.rev !== lastRev;
    return { ok: true, supported: true, changed, rev: data.rev };
  } catch {
    return { ...aUCUNE_REF, ok: false };
  }
}

/** Collections dont l'état « en base » doit être revérifié même si le poll est
 *  muet : les historiques écrits en place (audit, notifications) ont une
 *  référence parfois partagée avec l'état précédent. */
const ALWAYS_DIRTY_CHECK = ['auditLogs', 'notifications'] as const;

/** Payload `datasets` : état complet, ou SEULEMENT les collections modifiées
 *  depuis la dernière sauvegarde confirmée de ce poste (`only`). Le serveur
 *  ignore tout dataset absent du payload : un envoi partiel n'écrase donc
 *  jamais le travail des autres postes (et divise le trafic par le nombre de
 *  collections — c'est ce qui rend l'application utilisable à plusieurs
 *  centaines de milliers d'enregistrements). */
function buildDatasets(state: AppState, only?: Set<string> | null): Record<string, unknown> {
  const datasets: Record<string, unknown> = {};
  const pousser = (key: string): boolean => !only || only.has(key);
  for (const key of LIST_DATASETS) {
    if (!pousser(key)) continue;
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
  if (pousser('ticketSettings')) datasets.ticketSettings = state.ticketSettings;
  // Paramètres stockés en table `parametres` : sans eux, la facturation
  // mensuelle assurance et les prescripteurs externes ne quittaient jamais le
  // poste (ils étaient relus vides au démarrage suivant).
  // `issuedFactureNumbers` reste volontairement local : le serveur garantit la
  // non-réutilisation par la table `sequences`, et ce registre grossit avec
  // chaque facture émise (plusieurs Mo à terme) — inutile de le réécrire.
  if (pousser('monthlyInvoices')) datasets.monthlyInvoices = state.monthlyInvoices ?? [];
  if (pousser('prescripteursExternes')) datasets.prescripteursExternes = state.prescripteursExternes ?? [];
  for (const key of COUNTER_KEYS) {
    // Compteurs : toujours envoyés (2 entiers), le serveur prend le MAX.
    datasets[key] = (state as unknown as Record<string, unknown>)[key] ?? 0;
  }
  return datasets;
}

/** Collections réellement modifiées par ce poste depuis la dernière
 *  sauvegarde confirmée (comparaison par référence + garde sur les historiques
 *  écrits en place). `null` = pas de référence → il faut tout envoyer. */
function dirtyDatasets(state: AppState, baseline: AppState | null): Set<string> | null {
  // baseline = l'objet envoyé/relu la dernière fois (références) ; `null` au
  // premier cycle → tout est envoyé.
  if (!baseline) return null;
  const changed = changedTopKeys(state, baseline);
  if (changed === null) return null;
  const out = new Set<string>(changed);
  const sRec = state as unknown as Record<string, unknown>;
  const bRec = baseline as unknown as Record<string, unknown>;
  for (const key of ALWAYS_DIRTY_CHECK) {
    const a = sRec[key], b = bRec[key];
    const nA = Array.isArray(a) ? a.length : -1;
    const nB = Array.isArray(b) ? b.length : -1;
    if (nA !== nB) out.add(key);
  }
  return out;
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

/** Lit TOUT l'état depuis MySQL (le coût lourd : à ne plus faire « pour rien »).
 *  @returns l'état et la révision lue, ou null si la base est vide/illisible. */
async function readAllEtat(): Promise<{ state: AppState; rev: number | null; vierge: boolean } | null> {
  const res = await apiFetch(`${API_URL}?action=read_all`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.success !== true || !data.datasets) return null;
  const datasets = data.datasets as Record<string, unknown>;
  // Base vraiment vierge (aucun compte ET aucun patient ET aucune vente) :
  // on laisse l'app écrire l'état initial. Sinon, on charge la base existante
  // sans jamais écraser des données déjà présentes.
  const noUsers = !Array.isArray(datasets.users) || datasets.users.length === 0;
  const noPatients = !Array.isArray(datasets.patients) || datasets.patients.length === 0;
  const noVentes = !Array.isArray(datasets.ventes) || datasets.ventes.length === 0;
  const rev = typeof data.rev === 'number' ? (data.rev as number) : null;
  if (rev !== null) lastRev = rev;
  return { state: reconstructState(datasets), rev, vierge: noUsers && noPatients && noVentes };
}

/** Charge l'état complet de l'application depuis MySQL (tables normalisées).
 *  @returns l'état stocké, ou null si la base est vide / indisponible. */
export async function loadStateFromMysql(): Promise<AppState | null> {
  if (!IS_WAMP_BUILD) return null;
  try {
    const lus = await readAllEtat();
    if (!lus || lus.vierge) return null;
    return lus.state;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Impossible de charger l’état depuis MySQL :', e);
    return null;
  }
}

/** Envoie un payload vers `sync_all`.
 *  @returns `{ ok, rev, conflit }` — `conflit` = un autre poste a écrit pendant
 *  notre saisie (HTTP 409) : il faut relire, fusionner et rejouer. */
async function envoyerDatasets(
  payload: Record<string, unknown>,
  deletions: Record<string, string[]>,
  options: { viaBeacon?: boolean } = {},
): Promise<{ ok: boolean; rev: number | null; conflit: boolean; statut: number }> {
  const corps: Record<string, unknown> = { datasets: payload, deletions };
  if (lastRev !== null && !options.viaBeacon) corps.if_rev = lastRev;
  if (options.viaBeacon) {
    // sendBeacon ne peut pas poser d'en-tête : le jeton voyage dans le corps.
    corps.token = sessionToken;
    try {
      const blob = new Blob([JSON.stringify(corps)], { type: 'application/json' });
      const envoye = navigator.sendBeacon(`${API_URL}?action=sync_all`, blob);
      return { ok: envoye, rev: null, conflit: false, statut: envoye ? 200 : 0 };
    } catch {
      return { ok: false, rev: null, conflit: false, statut: 0 };
    }
  }
  const res = await apiFetch(`${API_URL}?action=sync_all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const data = await res.json().catch(() => null);
  const rev = (data && typeof (data as { rev?: unknown }).rev === 'number') ? (data as { rev: number }).rev : null;
  if (res.status === 409 && (data as { conflict?: boolean } | null)?.conflict === true) {
    return { ok: false, rev, conflit: true, statut: 409 };
  }
  const ok = res.ok && !!(data && (data as { success?: boolean }).success === true);
  if (ok && rev !== null) lastRev = rev;
  return { ok, rev, conflit: false, statut: res.status };
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
    const envoye = await envoyerDatasets(buildDatasets(state), {});
    if (envoye.ok) { dernierEnvoiComplet = Date.now(); setSyncBaseline(state); }
    return envoye.ok;
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
 * Enregistre les saisies de CE poste ET récupère celles des autres postes :
 *
 *   1. sonde légère (`action=poll`) : la base a-t-elle changé depuis notre
 *      dernière lecture ? Si non, AUCUNE relecture complète n'est faite ;
 *   2. si oui (ou si le serveur est ancien), lecture de l'état courant en base
 *      puis fusion à trois versions (base confirmée / local / distant) : aucune
 *      saisie n'est écrasée, les suppressions locales sont respectées ;
 *   3. écriture des SEULES collections modifiées par ce poste, avec la liste
 *      explicite des suppressions et la révision lue (`if_rev`) ;
 *   4. en cas de conflit (un collègue a écrit entre notre lecture et notre
 *      écriture) : relecture, refusion et rejou d'une seule tentative.
 *
 * C'est ce mécanisme qui fait remonter les consultations validées par le
 * médecin dans la file d'attente de la caisse, sans que la caisse n'écrase
 * en retour le travail du médecin — et sans que chaque frappe envoie tout le
 * dossier de tous les patients sur le réseau.
 */
export async function syncStateWithMysql(state: AppState): Promise<SyncResult> {
  if (!IS_WAMP_BUILD) return { ok: false, merged: null };
  try {
    const sonde = await pollWamp();
    let merged = state;
    if (!sonde.ok || !sonde.supported || sonde.changed) {
      const lus = await readAllEtat();
      if (!lus) return { ok: false, merged: null };
      merged = mergeStates(lastConfirmedState, state, lus.state);
    }
    const deletions = collectDeletions(lastConfirmedState, state);
    if (!merged.assuranceStorageSupported) {
      for (const key of Object.keys(deletions)) if (key.startsWith('assurance')) delete deletions[key];
    }

    const maintenant = Date.now();
    const envoiComplet = maintenant - dernierEnvoiComplet > PLEIN_ENVOI_INTERVALE_MS;
    let envoye = await envoyerDatasets(buildDatasets(merged, envoiComplet ? null : dirtyDatasets(merged, lastPushedRefs)), deletions);
    if (envoye.conflit) {
      const lus = await readAllEtat();
      if (!lus) return { ok: false, merged: null };
      merged = mergeStates(lastConfirmedState, merged, lus.state);
      envoye = await envoyerDatasets(buildDatasets(merged, null), deletions); // après conflit : on renvoie tout
      if (envoye.conflit) return { ok: false, merged: null }; // re-tenté au prochain cycle
    }
    if (!envoye.ok) return { ok: false, merged: null };

    if (envoiComplet || envoye.conflit) dernierEnvoiComplet = Date.now();
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
 * aucune modification en attente. Un sondage préalable évite de relire tout
 * l'état (dizaines de Mo à partir d'un an de fonctionnement) toutes les 5 s.
 */
export async function refreshStateFromMysql(state: AppState): Promise<AppState | null> {
  if (!IS_WAMP_BUILD) return null;
  try {
    const sonde = await pollWamp();
    if (sonde.ok && sonde.supported && !sonde.changed) return null; // rien de neuf
    const lus = await readAllEtat();
    if (!lus) return null;
    const merged = mergeStates(lastConfirmedState, state, lus.state);
    if (sameBusinessData(state, merged)) return null;
    return merged;
  } catch {
    return null;
  }
}

/**
 * Sauvegarde de secours utilisée à la fermeture de l'onglet (pagehide /
 * beforeunload) afin de ne perdre AUCUNE modification : envoi du DERNIER ÉTAT
 * COMPLET (pas de différentiel : c'est la dernière chance) vers MySQL via
 * `navigator.sendBeacon`. Aucun `if_rev` : une fermeture d'onglet ne doit
 * jamais être refusée pour cause de conflit, elle est refusée ou perdue.
 */
export function flushStateToMysql(state: AppState): void {
  if (!IS_WAMP_BUILD) return;
  try {
    void envoyerDatasets(buildDatasets(state), {}, { viaBeacon: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WAMP/MySQL] Envoi final impossible :', e);
  }
}

/**
 * Déconnexion propre : le jeton est révoqué côté serveur (table `sessions`).
 * Sans cet appel, un poste laissé ouvert (ou un PC volé) reste accessible
 * jusqu'à l'expiration naturelle du jeton, même après « Déconnexion » à l'écran.
 */
export async function logoutFromMysql(): Promise<void> {
  if (!IS_WAMP_BUILD) return;
  const jeton = sessionToken;
  sessionToken = null;
  lastRev = null;
  if (!jeton) return;
  try {
    await fetch(`${API_URL}?action=logout`, {
      method: 'POST',
      keepalive: true, // la requête doit survivre à la fermeture de l'onglet
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': jeton },
      body: JSON.stringify({ token: jeton }),
    });
  } catch {
    /* réseau déjà parti : le jeton meurt de toute façon à l'expiration (12 h) */
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
