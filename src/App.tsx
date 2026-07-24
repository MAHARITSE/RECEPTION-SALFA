import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import type { User } from './types';
import { createInitialState, migrateLegacyToVentes, type AppState } from './store';
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
  const [state, setState] = useState<AppState>(createInitialState());
  const [view, setView] = useState<AppView>('reception');
  const [showMessaging, setShowMessaging] = useState(false);
  const [messagingRecipientId, setMessagingRecipientId] = useState<string | null>(null);
  const [medicalRecordPatientId, setMedicalRecordPatientId] = useState<string | null>(null);

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
      </>
    );
  }

  /* ─── Vue Connexion ─── */
  if (view === 'login') {
    return <EcranConnexion users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
  }

  if (!state.currentUser) {
    return <EcranConnexion users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
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
          notifications={state.notifications}
          onLogout={handleLogout}
          onMarkRead={handleMarkRead}
          onOpenMessaging={() => handleOpenMessagingWithRecipient(null)}
          onOpenMedicalRecord={() => handleOpenMedicalRecord()}
          unreadMessages={myMsgCount}
        >
          <ModuleDossierMedical state={state} patientId={medicalRecordPatientId} onBack={() => { setView('staff'); setMedicalRecordPatientId(null); }} />
        </MiseEnPage>
        {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
      </>
    );
  }

  const renderModule = () => {
    switch (state.currentUser?.role) {
      case 'doctor': return <ModuleMedecin state={state} setState={setState} onOpenMedicalRecord={handleOpenMedicalRecord} />;
      case 'cashier': return <ModuleCaisse state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} />;
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
      <MiseEnPage user={state.currentUser} notifications={state.notifications} onLogout={handleLogout} onMarkRead={handleMarkRead}
        onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} onOpenMedicalRecord={state.currentUser.role === 'doctor' || state.currentUser.role === 'admin' ? handleOpenMedicalRecord : undefined} unreadMessages={myMsgCount}>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800">{roleTitles[state.currentUser.role] || 'Module'}</h2>
          <p className="text-slate-500 text-sm mt-1">
            Connecté: <strong>{state.currentUser.name}</strong> ({state.currentUser.id}) — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <ModuleErrorBoundary onReset={handleLogout}>
          {renderModule()}
        </ModuleErrorBoundary>
      </MiseEnPage>
      {showMessaging && <Messagerie state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
