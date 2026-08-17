import { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from 'react';
import type { User } from './types';
import { createInitialState, prepareLoadedState, migrateLegacyToVentes, normalizeFamilyBases, addAuditLog, addNotification, type AppState } from './store';
import { loadStateFromBrowser, saveStateToBrowser } from './browserDb';
import {
  IS_WAMP_BUILD,
  initialWampSync,
  loadStateFromMysql,
  saveStateToMysql,
  flushStateToMysql,
  syncStateWithMysql,
  refreshStateFromMysql,
  setSyncBaseline,
  type WampSyncState,
} from './wamp';
import ModuleReception from './components/ModuleReception';
import EcranConnexion from './components/EcranConnexion';
import MiseEnPage from './components/MiseEnPage';
import ModuleMedecin from './components/ModuleMedecin';
import ModuleCaisse from './components/ModuleCaisse';
import ModulePharmacie from './components/ModulePharmacie';
import ModuleMagasinier from './components/ModuleMagasinier';
import ModuleLaboratoire from './components/ModuleLaboratoire';
import ModuleAdministration from './components/ModuleAdministration';
import ModuleFacturationSocietes from './components/ModuleFacturationSocietes';
import ModuleDossierMedical from './components/ModuleDossierMedical';
import Messagerie from './components/Messagerie';
import FloatingThemeToggle from './components/ThemeToggle';

const roleTitles: Record<string, string> = {
  doctor: '🩺 Médecin — Consultation & Prescription',
  cashier: '💳 Caisse — Facturation & Ventes',
  pharmacy: '💊 Pharmacie — Dispensation & Stock',
  magasinier: '📦 Magasinier — Stock Central, Achats & Transferts',
  laboratory: '🔬 Laboratoire — Analyses & Résultats',
  admin: '⚙️ Administration — Configuration système',
  billing: '🏢 Facturation sociétés — Suivi des comptes conventionnés',
};

type AppView = 'reception' | 'login' | 'staff' | 'medicalRecord';

/* ─── Badge de synchronisation MySQL — visible UNIQUEMENT dans le build WAMP
   (mode « toutes les données dans MySQL »). Affiche en direct l'état de la
   liaison avec MySQL : chargement initial, sauvegarde, erreur ou synchronisé. ─── */
function WampSyncBadge({ wamp }: { wamp: WampSyncState }) {
  if (!wamp.enabled) return null;

  const time = wamp.lastSavedAt ? new Date(wamp.lastSavedAt).toLocaleTimeString('fr-FR') : null;

  let cls = 'border-slate-300 bg-slate-50/95 text-slate-600';
  let icon = '🔄';
  let label = 'Chargement des données MySQL…';

  if (wamp.loading) {
    icon = '🔄';
    label = 'Chargement des données MySQL…';
  } else if (wamp.error) {
    cls = 'border-red-300 bg-red-50/95 text-red-700';
    icon = '⚠️';
    label = 'MySQL injoignable — données en mémoire uniquement';
  } else if (wamp.syncing) {
    cls = 'border-amber-300 bg-amber-50/95 text-amber-800';
    icon = '💾';
    label = 'Sauvegarde MySQL…';
  } else if (wamp.usingMysql) {
    cls = 'border-emerald-300 bg-emerald-50/95 text-emerald-700';
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
          <h2 className="text-xl font-bold text-red-700">Une erreur est survenue</h2>
          <p className="text-sm text-slate-600 max-w-md">{this.state.error?.message || 'Erreur inconnue du module.'}</p>
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
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-white">MediCare HIS — Une erreur est survenue</h1>
          <p className="text-sm text-slate-300 max-w-lg">
            L'application a rencontré un problème inattendu. Vos données de session n'ont pas été perdues.
            <br />
            <span className="text-slate-400">{this.state.error?.message || 'Erreur inconnue.'}</span>
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
  const [view, setView] = useState<AppView>('reception');
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

  /* ─── WAMP : au démarrage, TOUTES les données sont chargées depuis MySQL.
     Si MySQL ne contient encore rien, l'état local initial y est écrit
     immédiatement pour que la base serve de référence unique. ─── */
  useEffect(() => {
    if (!IS_WAMP_BUILD) {
      setWamp((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    (async () => {
      const stored = await loadStateFromMysql();
      if (cancelled) return;
      if (stored) {
        const loaded = prepareLoadedState(stored);
        // Point de départ de la fusion multi-postes : ce que ce poste sait déjà en base.
        setSyncBaseline(loaded);
        setState(loaded);
        setWamp((s) => ({ ...s, loading: false, usingMysql: true, lastSavedAt: Date.now() }));
      } else {
        setWamp((s) => ({ ...s, loading: false }));
        // Aucun état en base : on y écrit l'état initial (seed) sans tarder
        const ok = await saveStateToMysql(prepareLoadedState(seedRef.current));
        if (!cancelled && ok) {
          setWamp((s) => ({ ...s, usingMysql: true, lastSavedAt: Date.now() }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setState(prepareLoadedState(stored));
      } else {
        // Première ouverture : initialise la base locale avec le jeu de départ.
        await saveStateToBrowser(prepareLoadedState(seedRef.current));
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
    const timer = window.setTimeout(() => { void saveStateToBrowser(state); }, 500);
    return () => window.clearTimeout(timer);
  }, [state, browserDbLoading]);

  /* Une dernière écriture est demandée à la fermeture de l'onglet. */
  useEffect(() => {
    if (IS_WAMP_BUILD) return;
    const flush = () => { void saveStateToBrowser(stateRef.current); };
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
      if (!wampRef.current.loading) flushStateToMysql(stateRef.current);
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

  const handleLogin = (user: User) => {
    setState((prev) => ({ ...prev, currentUser: user }));
    setView('staff');
  };

  const handleLogout = () => {
    setState((prev) => ({ ...prev, currentUser: null }));
    setView('reception');
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
    if (!IS_WAMP_BUILD) return;
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

  /* ─── Vue Réception ─── */
  if (view === 'reception') {
    return (
      <>
        <ModuleReception state={state} setState={setState} onStaffLogin={() => setView('login')} onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} />
        {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  /* ─── Vue Connexion ─── */
  if (view === 'login') {
    return (
      <>
        <EcranConnexion users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  if (!state.currentUser) {
    return (
      <>
        <EcranConnexion users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />
        <WampSyncBadge wamp={wamp} />
      </>
    );
  }

  /* ─── Vue Dossier Médical ─── */
  if (view === 'medicalRecord') {
    if (state.currentUser.role !== 'doctor' && state.currentUser.role !== 'admin') {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-red-700 font-semibold">Accès refusé : seuls les médecins et administrateurs peuvent consulter les dossiers médicaux.</div>;
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
      case 'doctor': return <ModuleMedecin state={state} setState={setState} onOpenMedicalRecord={handleOpenMedicalRecord} />;
      case 'cashier': return <ModuleCaisse state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} onRefreshQueue={handleForceRefresh} />;
      case 'pharmacy': return <ModulePharmacie state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} />;
      case 'magasinier': return <ModuleMagasinier state={state} setState={setState} />;
      case 'laboratory': return <ModuleLaboratoire state={state} setState={setState} />;
      case 'admin': return <ModuleAdministration state={state} setState={setState} />;
      case 'billing': return <ModuleFacturationSocietes state={state} setState={setState} />;
      default: return <div>Module non trouvé</div>;
    }
  };

  return (
    <>
      <MiseEnPage user={state.currentUser} patients={state.patients} notifications={state.notifications} onLogout={handleLogout} onMarkRead={handleMarkRead} onNotificationAction={handleNotificationAction}
        onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} onOpenMedicalRecord={state.currentUser.role === 'doctor' || state.currentUser.role === 'admin' ? handleOpenMedicalRecord : undefined} unreadMessages={myMsgCount}
        fullHeight={state.currentUser.role === 'admin'}>
        {state.currentUser.role !== 'admin' && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{roleTitles[state.currentUser.role] || 'Module'}</h2>
            <p className="text-slate-500 text-sm mt-1">
              Connecté: <strong>{state.currentUser.name}</strong> ({state.currentUser.id}) — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        )}
        <ModuleErrorBoundary onReset={handleLogout}>
          {renderModule()}
        </ModuleErrorBoundary>
      </MiseEnPage>
      {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
      <WampSyncBadge wamp={wamp} />
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
      <FloatingThemeToggle />
    </AppErrorBoundary>
  );
}
