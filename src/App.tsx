import { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from 'react';
import type { User } from './types';
import { createInitialState, prepareLoadedState, migrateLegacyToVentes, normalizeFamilyBases, addAuditLog, addNotification, type AppState } from './store';
import { loadStateFromBrowser, saveStateToBrowser, subscribeBrowserState, readBrowserMeta } from './browserDb';
import { mergeStates, sameBusinessData } from './syncMerge';
import {
  IS_WAMP_BUILD,
  initialWampSync,
  loadStateFromMysql,
  saveStateToMysql,
  flushStateToMysql,
  syncStateWithMysql,
  refreshStateFromMysql,
  setSyncBaseline,
  onWampUnauthorized,
  clearWampSession,
  type WampSyncState,
} from './wamp';
import { daysSinceBackup } from './utils/sauvegarde';
import PrintFeedback from './components/PrintFeedback';
import ModuleReception from './components/ModuleReception';
import EcranConnexion from './components/EcranConnexion';
import MiseEnPage from './components/MiseEnPage';
import ModuleMedecin from './components/ModuleMedecin';
import ModuleCaisse from './components/ModuleCaisse';
import ModulePharmacie from './components/ModulePharmacie';
import ModuleMagasinier from './components/ModuleMagasinier';
import ModuleLaboratoire from './components/ModuleLaboratoire';
import ModuleAdministration from './components/ModuleAdministration';
import ModuleSuiviAssurance from './modules/assurance/ModuleSuiviAssurance';
import ModuleDossierMedical from './components/ModuleDossierMedical';
import Messagerie from './components/Messagerie';
import FloatingThemeToggle from './components/ThemeToggle';


type AppView = 'reception' | 'login' | 'staff' | 'medicalRecord';

/* ─── Badge de synchronisation MySQL — visible UNIQUEMENT dans le build WAMP
   (mode « toutes les données dans MySQL »). Affiche en direct l'état de la
   liaison avec MySQL : chargement initial, sauvegarde, erreur ou synchronisé. ─── */
function WampSyncBadge({ wamp }: { wamp: WampSyncState }) {
  if (!wamp.enabled) return null;

  const time = wamp.lastSavedAt ? new Date(wamp.lastSavedAt).toLocaleTimeString('fr-FR') : null;

  let cls = 'border-line-strong bg-surface-muted/95 text-ink-secondary';
  let icon = '🔄';
  let label = 'Chargement des données MySQL…';

  if (wamp.loading) {
    icon = '🔄';
    label = 'Chargement des données MySQL…';
  } else if (wamp.error) {
    cls = 'border-red-300 dark:border-red-500/40 bg-red-50/95 dark:bg-red-500/8 text-red-700 dark:text-red-400';
    icon = '⚠️';
    label = 'MySQL injoignable — données en mémoire uniquement';
  } else if (wamp.syncing) {
    cls = 'border-amber-300 dark:border-amber-500/40 bg-amber-50/95 dark:bg-amber-500/8 text-amber-800 dark:text-amber-300';
    icon = '💾';
    label = 'Sauvegarde MySQL…';
  } else if (wamp.usingMysql) {
    cls = 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/95 dark:bg-emerald-500/8 text-emerald-700 dark:text-emerald-400';
    icon = '✅';
    label = `MySQL : postes synchronisés${time ? ` (${time})` : ''}`;
  }

  return (
    <div
      className={`fixed bottom-5 left-5 z-[9990] flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur ${cls}`}
      title={time ? `Dernière sauvegarde MySQL : ${time}` : 'Synchronisation MySQL (WAMP)'}
    >
      <span className="leading-none">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/* ─── Rappel de sauvegarde JSON ───
   En mode navigateur, la base vit DANS ce navigateur : sans export régulier,
   une panne disque = tout perdu. En WAMP, MySQL est la référence (sauvegardée
   par outils/sauvegarder.bat) mais un export JSON reste une 2ᵉ sécurité.
   Affiché après 7 jours sans sauvegarde (ou jamais), masquable jusqu'au prochain export. */
function BackupReminderBanner({ state }: { state: AppState }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const days = daysSinceBackup(state.lastBackupAt);
  const hasData = state.patients.length > 0 || state.invoices.length > 0 || state.ventes.length > 0;
  if (!hasData) return null;
  if (days !== null && days < 7) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9990] flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/95 dark:bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 shadow-lg backdrop-blur">
      <span>
        💾 {days === null ? 'Aucune sauvegarde SQL exportée.' : `Dernière sauvegarde SQL il y a ${days} jour${days > 1 ? 's' : ''}.`}{' '}
        Pensez à exporter (module Administration).
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-500/40 hover:bg-amber-100 dark:hover:bg-amber-500/20 cursor-pointer"
      >
        Masquer
      </button>
    </div>
  );
}

/* ─── Error Boundary : empêche l'écran blanc si un module plante ─── */
interface EBState { hasError: boolean; error: Error | null; }
class ModuleErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ModuleErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold text-red-700 dark:text-red-400">Une erreur est survenue</h2>
          <p className="text-sm text-ink-secondary max-w-md">{this.state.error?.message || 'Erreur inconnue du module.'}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset(); }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Error Boundary GLOBAL : plus AUCUN écran blanc possible, même si
   la page de connexion, la réception, la mise en page ou la messagerie plante.
   Affiche un message clair avec un bouton « Réessayer » (recharge l'app). ─── */
class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[AppErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-canvas">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-ink-strong">MediCare HIS — Une erreur est survenue</h1>
          <p className="text-sm text-ink-secondary max-w-lg">
            L'application a rencontré un problème inattendu. Vos données de session n'ont pas été perdues.
            <br />
            <span className="text-ink-faint">{this.state.error?.message || 'Erreur inconnue.'}</span>
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer"
            >
              Réessayer
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 cursor-pointer"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const [state, setState] = useState<AppState>(createInitialState);
  // WAMP : la réception elle-même exige une session → on démarre sur la connexion.
  const [view, setView] = useState<AppView>(IS_WAMP_BUILD ? 'login' : 'reception');
  const [showMessaging, setShowMessaging] = useState(false);
  const [messagingRecipientId, setMessagingRecipientId] = useState<string | null>(null);
  const [medicalRecordPatientId, setMedicalRecordPatientId] = useState<string | null>(null);

  /* ─── WAMP / MySQL : état de la synchronisation ─── */
  const [wamp, setWamp] = useState<WampSyncState>(initialWampSync);
  // Hors WAMP, les données métier sont conservées dans IndexedDB du navigateur.
  const [browserDbLoading, setBrowserDbLoading] = useState(!IS_WAMP_BUILD);

  // Références toujours à jour pour les effets « longue durée »
  const stateRef = useRef(state);
  stateRef.current = state;
  const wampRef = useRef(wamp);
  wampRef.current = wamp;
  // État local initial (seed) — utilisé si MySQL ne contient encore aucune donnée
  const seedRef = useRef(state);
  // Après le chargement initial, on saute une seule sauvegarde redondante
  const skipFirstSave = useRef(true);
  const skipFirstBrowserSave = useRef(true);
  // Un seul échange MySQL à la fois : évite que deux synchronisations
  // concurrentes ne se marchent dessus (et ne ressuscitent des données).
  const syncInFlight = useRef(false);
  const pendingSync = useRef(false);
  // Mode navigateur : dernière version connue de la base locale (référence de fusion)
  const browserBaseline = useRef<AppState | null>(null);
  const browserSyncInFlight = useRef(false);
  // Dernier `meta` vu (sonde légère : évite les relectures complètes inutiles).
  const browserMeta = useRef<{ savedAt: number; tabId: string } | null>(null);
  // WAMP : chargement post-connexion effectué (une seule fois par session).
  const wampLoaded = useRef(false);

  /* ─── WAMP : les données sont chargées APRÈS connexion (handleLogin) ───
     read_all exige un jeton de session, délivré uniquement par login : aucun
     pré-chargement anonyme. Ici, on sort juste de l'état « chargement ». */
  useEffect(() => {
    setWamp((s) => ({ ...s, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── WAMP : session expirée ou refusée (401) → retour à la connexion ─── */
  useEffect(() => {
    if (!IS_WAMP_BUILD) return;
    onWampUnauthorized(() => {
      setState((prev) => ({ ...prev, currentUser: null }));
      setView('login');
      setWamp((s) => ({ ...s, error: 'Session expirée : reconnectez-vous.' }));
    });
  }, []);

  /* ─── MODE NAVIGATEUR : base locale IndexedDB ───
     Cette voie est strictement séparée de WAMP : aucune requête MySQL n'est
     effectuée. Les données restent dans le profil du navigateur. */
  useEffect(() => {
    if (IS_WAMP_BUILD) return;
    let cancelled = false;
    (async () => {
      const stored = await loadStateFromBrowser();
      if (cancelled) return;
      if (stored) {
        const loaded = prepareLoadedState(stored);
        // Point de départ de la fusion entre onglets : ce que la base contient déjà.
        browserBaseline.current = loaded;
        browserMeta.current = await readBrowserMeta();
        setState(loaded);
      } else {
        // Première ouverture : initialise la base locale avec le jeu de départ.
        const seed = prepareLoadedState(seedRef.current);
        browserBaseline.current = seed;
        await saveStateToBrowser(seed);
        browserMeta.current = await readBrowserMeta();
      }
      if (!cancelled) setBrowserDbLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── MODE NAVIGATEUR : sauvegarde automatique dans IndexedDB ─── */
  useEffect(() => {
    if (IS_WAMP_BUILD || browserDbLoading) return;
    if (skipFirstBrowserSave.current) {
      skipFirstBrowserSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const snapshot = state;
      // Écriture DIFFÉRENTIELLE : seules les collections modifiées depuis la
      // dernière sauvegarde confirmée sont réécrites (référence de fusion).
      void saveStateToBrowser(snapshot, browserBaseline.current).then(async (ok) => {
        // La base contient désormais cet état : il devient la référence de fusion.
        if (!ok) return;
        browserBaseline.current = snapshot;
        browserMeta.current = await readBrowserMeta();
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state, browserDbLoading]);

  /* ─── MODE NAVIGATEUR : synchronisation entre onglets / fenêtres ───
     Réception, médecin, caisse… tournent souvent dans des onglets différents du
     même navigateur. Sans relecture de la base locale, chaque onglet restait sur
     son propre état en mémoire : les patients envoyés par la réception
     n'arrivaient jamais dans la file d'attente du médecin. On relit donc la base
     (à chaque écriture d'un autre onglet, au retour sur l'onglet et toutes les
     3 secondes) et on FUSIONNE — aucune saisie en cours n'est écrasée. */
  useEffect(() => {
    if (IS_WAMP_BUILD || browserDbLoading) return;

    const refreshFromBrowserDb = async () => {
      if (browserSyncInFlight.current) return;
      // Sonde légère AVANT toute relecture : un seul enregistrement méta
      // (quelques octets). Base inchangée → on ne relit RIEN (fini les
      // relectures complètes de plusieurs secondes à chaque cycle).
      const meta = await readBrowserMeta();
      const last = browserMeta.current;
      if (meta && last && meta.savedAt === last.savedAt && meta.tabId === last.tabId) return;
      browserSyncInFlight.current = true;
      try {
        const stored = await loadStateFromBrowser();
        browserMeta.current = await readBrowserMeta();
        if (!stored) return;
        const remote = prepareLoadedState(stored);
        const merged = mergeStates(browserBaseline.current, stateRef.current, remote);
        if (!sameBusinessData(stateRef.current, merged)) setState(merged);
      } catch {
        /* base momentanément indisponible : nouvelle tentative au prochain cycle */
      } finally {
        browserSyncInFlight.current = false;
      }
    };

    const unsubscribe = subscribeBrowserState(() => { void refreshFromBrowserDb(); });
    const onVisible = () => { if (!document.hidden) void refreshFromBrowserDb(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refreshFromBrowserDb();
    }, 3000);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(timer);
    };
  }, [browserDbLoading]);

  /* Une dernière écriture est demandée à la fermeture de l'onglet. */
  useEffect(() => {
    if (IS_WAMP_BUILD) return;
    const flush = () => {
      const snapshot = stateRef.current;
      void saveStateToBrowser(snapshot, browserBaseline.current).then((ok) => {
        if (ok) browserBaseline.current = snapshot;
      });
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  /* ─── WAMP : CHAQUE modification de l'état est envoyée à MySQL, ET les saisies
     des autres postes sont récupérées dans le même échange (fusion à trois
     versions). Sans cela, le dernier poste qui enregistre écrasait le travail
     des autres : les consultations validées par le médecin n'arrivaient jamais
     dans la file d'attente de la caisse. ─── */
  useEffect(() => {
    if (!IS_WAMP_BUILD) return;
    if (wamp.loading) return; // pendant le chargement initial on ne réécrit pas la base
    if (!stateRef.current.currentUser) return; // déconnecté : rien à synchroniser
    if (skipFirstSave.current) {
      // L'état vient d'être chargé depuis MySQL (ou écrit au démarrage) : rien à sauver
      skipFirstSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      if (syncInFlight.current) { pendingSync.current = true; return; }
      syncInFlight.current = true;
      setWamp((s) => ({ ...s, syncing: true }));
      syncStateWithMysql(stateRef.current).then(({ ok, merged }) => {
        syncInFlight.current = false;
        if (merged) setState(merged);
        setWamp((s) => ({
          ...s,
          syncing: false,
          usingMysql: s.usingMysql || ok,
          lastSavedAt: ok ? Date.now() : s.lastSavedAt,
          error: ok ? null : (s.error ?? 'Échec de la synchronisation MySQL.'),
        }));
      });
    }, 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, wamp.loading]);

  /* ─── WAMP : rafraîchissement périodique ───
     Un poste peut rester inactif (la caisse attend des patients). Sans lecture
     régulière, il ne verrait jamais arriver les saisies des autres services.
     Toutes les 5 secondes, les nouveautés de MySQL sont fusionnées dans l'état
     local — les saisies en cours sur ce poste ne sont jamais écrasées. */
  useEffect(() => {
    if (!IS_WAMP_BUILD) return;
    if (wamp.loading) return;
    const timer = window.setInterval(() => {
      if (syncInFlight.current) return;
      if (document.hidden) return; // onglet en arrière-plan : inutile de solliciter MySQL
      if (!stateRef.current.currentUser) return; // déconnecté : la re-connexion recharge
      syncInFlight.current = true;
      refreshStateFromMysql(stateRef.current)
        .then((merged) => {
          if (merged) setState(merged);
        })
        .finally(() => {
          syncInFlight.current = false;
          if (pendingSync.current) {
            pendingSync.current = false;
            void syncStateWithMysql(stateRef.current).then(({ merged }) => { if (merged) setState(merged); });
          }
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [wamp.loading]);

  /* ─── WAMP : enregistrement final du dernier état à la fermeture de l'onglet
     (pagehide / beforeunload) pour ne perdre AUCUNE donnée. ─── */
  useEffect(() => {
    if (!IS_WAMP_BUILD) return;
    const flush = () => {
      if (!wampRef.current.loading && stateRef.current.currentUser) flushStateToMysql(stateRef.current);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);


  // Migration automatique idempotente : au 1er chargement, les anciennes
  // factures + dossiers hospit/bloc sont dupliqués dans la table unifiée `ventes`.
  useEffect(() => {
    setState((prev) => {
      const hasLegacy = (prev.invoices?.length || 0) + (prev.hbRecords?.length || 0) > 0;
      const alreadyMigrated = (prev.ventes?.length || 0) > 0;
      if (!hasLegacy || alreadyMigrated) return prev;
      const next = { ...prev };
      const { migratedInvoices, migratedHb } = migrateLegacyToVentes(next);
      if (migratedInvoices === 0 && migratedHb === 0) return prev;
      // eslint-disable-next-line no-console
      console.info(`[ventes] migration automatique : ${migratedInvoices} facture(s), ${migratedHb} dossier(s) hospit/bloc.`);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Migration idempotente : base familles MEDIC / LAB / ECHO et ancien code LABO -> LAB.
  useEffect(() => {
    setState((prev) => {
      const next = normalizeFamilyBases(prev);
      const sameFamilies = JSON.stringify(prev.familles || []) === JSON.stringify(next.familles || []);
      const sameArticles = JSON.stringify((prev.articles || []).map((a) => a.family)) === JSON.stringify((next.articles || []).map((a) => a.family));
      return sameFamilies && sameArticles ? prev : next;
    });
  }, []);

  /** Migration transparente (navigateur) : un mot de passe historique en clair
   *  accepté à la connexion devient aussitôt une empreinte dans la base. */
  const handlePasswordUpgraded = (userId: string, hash: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, password: hash } : u)),
    }));
  };

  const handleLogin = (user: User) => {
    setState((prev) => ({ ...prev, currentUser: user }));
    setView('staff');
    // WAMP : premier chargement depuis MySQL (jeton obtenu à l'instant).
    // Base vierge → le jeu initial y est écrit (premier administrateur).
    if (IS_WAMP_BUILD && !wampLoaded.current) {
      wampLoaded.current = true;
      setWamp((s) => ({ ...s, loading: true, error: null }));
      (async () => {
        const stored = await loadStateFromMysql();
        if (stored) {
          const loaded = prepareLoadedState(stored);
          setSyncBaseline(loaded);
          skipFirstSave.current = true;
          setState({ ...loaded, currentUser: user });
          setWamp((s) => ({ ...s, loading: false, usingMysql: true, lastSavedAt: Date.now() }));
        } else {
          const seed = prepareLoadedState(seedRef.current);
          setSyncBaseline(seed);
          const ok = await saveStateToMysql(seed);
          skipFirstSave.current = true;
          setState({ ...seed, currentUser: user });
          setWamp((s) => ({
            ...s,
            loading: false,
            usingMysql: ok,
            lastSavedAt: ok ? Date.now() : s.lastSavedAt,
            error: ok ? null : 'MySQL injoignable — initialisation impossible, réessayez.',
          }));
        }
      })();
    }
  };

  const handleLogout = () => {
    if (IS_WAMP_BUILD) clearWampSession();
    setState((prev) => ({ ...prev, currentUser: null }));
    setView(IS_WAMP_BUILD ? 'login' : 'reception');
  };

  const handleOpenMedicalRecord = (patientId?: string) => {
    setMedicalRecordPatientId(patientId || null);
    setView('medicalRecord');
  };

  const handleMarkRead = (notifId: string) => {
    setState((prev) => ({ ...prev, notifications: prev.notifications.map((n) => n.id === notifId ? { ...n, read: true } : n) }));
  };

  const handleNotificationAction = (notifId: string, accepted: boolean) => {
    setState((prev) => {
      const notification = prev.notifications.find((n) => n.id === notifId);
      if (!notification?.action || notification.action.type !== 'pharmacy-unblock') return prev;
      const next = {
        ...prev,
        articles: accepted ? prev.articles.map((a) => a.id === notification.action!.articleId
          ? { ...a, saleBlocked: false, saleBlockReason: undefined, saleBlockedAt: undefined, saleBlockedBy: undefined } : a) : prev.articles,
        notifications: prev.notifications.map((n) => n.id === notifId ? { ...n, read: true, action: undefined } : n),
      };
      const decider = prev.currentUser?.name || 'la caisse';
      addAuditLog(next, accepted ? 'DEBLOCAGE_VENTE' : 'REFUS_DEBLOCAGE_VENTE', `${notification.action.articleName} — déblocage ${accepted ? 'accordé' : 'refusé'} par ${decider}`);
      // Accusé de réception vers la pharmacie : sans ce retour, le pharmacien
      // ne savait pas si son déblocage avait été validé (article « toujours bloqué »).
      addNotification(
        next,
        'pharmacy',
        accepted
          ? `✅ Déblocage vente accordé : « ${notification.action.articleName} » est de nouveau vendable en pharmacie.`
          : `❌ Déblocage vente refusé : « ${notification.action.articleName} » reste bloqué à la vente en pharmacie.`,
        accepted ? 'info' : 'warning'
      );
      return next;
    });
  };

  /** Relecture immédiate des saisies des autres postes (bouton « rafraîchir »). */
  const handleForceRefresh = () => {
    if (!IS_WAMP_BUILD) {
      // Mode navigateur : relecture immédiate de la base locale (autres onglets)
      if (browserSyncInFlight.current) return;
      browserSyncInFlight.current = true;
      void loadStateFromBrowser()
        .then(async (stored) => {
          browserMeta.current = await readBrowserMeta();
          if (!stored) return;
          const merged = mergeStates(browserBaseline.current, stateRef.current, prepareLoadedState(stored));
          if (!sameBusinessData(stateRef.current, merged)) setState(merged);
        })
        .finally(() => { browserSyncInFlight.current = false; });
      return;
    }
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    refreshStateFromMysql(stateRef.current)
      .then((merged) => { if (merged) setState(merged); })
      .finally(() => { syncInFlight.current = false; });
  };

  const myMsgCount = state.messages.filter((m) => m.toUserId === (state.currentUser?.id || 'RECEPTION') && !m.read).length;

  const handleOpenMessagingWithRecipient = (id?: string | null) => {
    if (id) setMessagingRecipientId(id);
    setShowMessaging(true);
  };

  const handleCloseMessaging = () => {
    setShowMessaging(false);
    setMessagingRecipientId(null);
  };

  /* ─── Vue Réception ─── (WAMP : session obligatoire — sans utilisateur, on tombe sur la connexion) */
  if (view === 'reception' && (!IS_WAMP_BUILD || state.currentUser)) {
    return (
      <>
        <ModuleReception state={state} setState={setState} onStaffLogin={() => setView('login')} onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} />
        <BackupReminderBanner key={state.lastBackupAt || 'never'} state={state} />
        {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  /* ─── Vue Connexion ─── */
  if (view === 'login') {
    return (
      <>
        <EcranConnexion users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} onPasswordUpgraded={handlePasswordUpgraded} />
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  if (!state.currentUser) {
    return (
      <>
        <EcranConnexion users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} onPasswordUpgraded={handlePasswordUpgraded} />
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  /* ─── Vue Dossier Médical ─── */
  if (view === 'medicalRecord') {
    if (state.currentUser.role !== 'doctor' && state.currentUser.role !== 'admin') {
      return <div className="min-h-screen flex items-center justify-center bg-surface-muted text-red-700 dark:text-red-400 font-semibold">Accès refusé : seuls les médecins et administrateurs peuvent consulter les dossiers médicaux.</div>;
    }
    return (
      <>
        <MiseEnPage
          user={state.currentUser}
          patients={state.patients}
          notifications={state.notifications}
          onLogout={handleLogout}
          onMarkRead={handleMarkRead}
          onNotificationAction={handleNotificationAction}
          onOpenMessaging={() => handleOpenMessagingWithRecipient(null)}
          onOpenMedicalRecord={(patientId) => handleOpenMedicalRecord(patientId)}
          unreadMessages={myMsgCount}
        >
          <ModuleDossierMedical state={state} patientId={medicalRecordPatientId} onBack={() => { setView('staff'); setMedicalRecordPatientId(null); }} />
        </MiseEnPage>
        {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  const renderModule = () => {
    switch (state.currentUser?.role) {
      case 'doctor': return <ModuleMedecin state={state} setState={setState} onOpenMedicalRecord={handleOpenMedicalRecord} onRefreshQueue={handleForceRefresh} />;
      case 'cashier': return <ModuleCaisse state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} onRefreshQueue={handleForceRefresh} />;
      case 'pharmacy': return <ModulePharmacie state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} />;
      case 'magasinier': return <ModuleMagasinier state={state} setState={setState} />;
      case 'laboratory': return <ModuleLaboratoire state={state} setState={setState} />;
      case 'admin': return <ModuleAdministration state={state} setState={setState} />;
      case 'billing': return <ModuleSuiviAssurance state={state} setState={setState} />;
      case 'receptionist': return <ModuleReception state={state} setState={setState} onStaffLogin={() => { /* déjà dans l'espace personnel */ }} onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} />;
    }
  };

  return (
    <>
      <MiseEnPage user={state.currentUser} patients={state.patients} notifications={state.notifications} onLogout={handleLogout} onMarkRead={handleMarkRead} onNotificationAction={handleNotificationAction}
        onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} onOpenMedicalRecord={state.currentUser.role === 'doctor' || state.currentUser.role === 'admin' ? handleOpenMedicalRecord : undefined} unreadMessages={myMsgCount}
        onChangeRole={(role) => setState((prev) => ({ ...prev, currentUser: { ...prev.currentUser!, role } }))}
        fullHeight={state.currentUser.role === 'admin'}>
        <ModuleErrorBoundary onReset={handleLogout}>
          {renderModule()}
        </ModuleErrorBoundary>
      </MiseEnPage>
      {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
      <BackupReminderBanner key={state.lastBackupAt || 'never'} state={state} />
      <WampSyncBadge wamp={wamp} />
    </>
  );
}

export default function App() {
  return (
    <>
      <AppErrorBoundary>
        <AppInner />
      </AppErrorBoundary>
      <PrintFeedback />
      <FloatingThemeToggle />
    </>
  );
}
