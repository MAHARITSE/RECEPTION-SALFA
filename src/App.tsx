import { useState, Component, type ReactNode, type ErrorInfo } from 'react';
import type { User } from './types';
import { createInitialState, type AppState } from './store';
import ReceptionModule from './components/ReceptionModule';
import LoginScreen from './components/LoginScreen';
import Layout from './components/Layout';
import DoctorModule from './components/DoctorModule';
import CashierModule from './components/CashierModule';
import PharmacyModule from './components/PharmacyModule';
import MagasinierModule from './components/MagasinierModule';
import LaboratoryModule from './components/LaboratoryModule';
import HospitalizationModule from './components/HospitalizationModule';
import AdminModule from './components/AdminModule';
import MedicalRecordModule from './components/MedicalRecordModule';
import Messaging from './components/Messaging';

const roleTitles: Record<string, string> = {
  doctor: '🩺 Médecin — Consultation & Prescription',
  cashier: '💳 Caisse — Facturation & Ventes',
  pharmacy: '💊 Pharmacie — Dispensation & Stock',
  magasinier: '📦 Magasinier — Stock Central, Achats & Transferts',
  laboratory: '🔬 Laboratoire — Analyses & Résultats',
  hospitalization: '🏨 Hospitalisation — Gestion des séjours',
  admin: '⚙️ Administration — Configuration système',
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

export default function App() {
  const [state, setState] = useState<AppState>(createInitialState());
  const [view, setView] = useState<AppView>('reception');
  const [showMessaging, setShowMessaging] = useState(false);

  const handleLogin = (user: User) => {
    setState((prev) => ({ ...prev, currentUser: user }));
    setView('staff');
  };

  const handleLogout = () => {
    setState((prev) => ({ ...prev, currentUser: null }));
    setView('reception');
  };

  const handleOpenMedicalRecord = () => setView('medicalRecord');

  const handleMarkRead = (notifId: string) => {
    setState((prev) => ({ ...prev, notifications: prev.notifications.map((n) => n.id === notifId ? { ...n, read: true } : n) }));
  };

  const myMsgCount = state.messages.filter((m) => m.toUserId === (state.currentUser?.id || 'RECEPTION') && !m.read).length;

  /* ─── Vue Réception ─── */
  if (view === 'reception') {
    return (
      <>
        <ReceptionModule state={state} setState={setState} onStaffLogin={() => setView('login')} onOpenMessaging={() => setShowMessaging(true)} />
        {showMessaging && <Messaging state={state} setState={setState} onClose={() => setShowMessaging(false)} />}
      </>
    );
  }

  /* ─── Vue Login ─── */
  if (view === 'login') {
    return <LoginScreen users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
  }

  /* ─── Garde : si pas d'utilisateur connecté, rediriger vers login (SANS setView pendant le rendu) ─── */
  if (!state.currentUser) {
    return <LoginScreen users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
  }

  /* ─── Vue Dossier Médical (médecins uniquement) ─── */
  if (view === 'medicalRecord') {
    if (state.currentUser.role !== 'doctor') {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-red-700 font-semibold">Accès refusé : seuls les médecins peuvent consulter les dossiers médicaux.</div>;
    }
    return (
      <>
        <Layout
          user={state.currentUser}
          notifications={state.notifications}
          onLogout={handleLogout}
          onMarkRead={handleMarkRead}
          onOpenMessaging={() => setShowMessaging(true)}
          onOpenMedicalRecord={handleOpenMedicalRecord}
          unreadMessages={myMsgCount}
        >
          <MedicalRecordModule state={state} onBack={() => setView('staff')} />
        </Layout>
        {showMessaging && <Messaging state={state} setState={setState} onClose={() => setShowMessaging(false)} />}
      </>
    );
  }

  /* ─── Vue Staff (modules par rôle) ─── */
  const renderModule = () => {
    switch (state.currentUser?.role) {
      case 'doctor': return <DoctorModule state={state} setState={setState} />;
      case 'cashier': return <CashierModule state={state} setState={setState} />;
      case 'pharmacy': return <PharmacyModule state={state} setState={setState} />;
      case 'magasinier': return <MagasinierModule state={state} setState={setState} />;
      case 'laboratory': return <LaboratoryModule state={state} setState={setState} />;
      case 'hospitalization': return <HospitalizationModule state={state} setState={setState} />;
      case 'admin': return <AdminModule state={state} setState={setState} />;
      default: return <div>Module non trouvé</div>;
    }
  };

  return (
    <>
      <Layout user={state.currentUser} notifications={state.notifications} onLogout={handleLogout} onMarkRead={handleMarkRead}
        onOpenMessaging={() => setShowMessaging(true)} onOpenMedicalRecord={state.currentUser.role === 'doctor' ? handleOpenMedicalRecord : undefined} unreadMessages={myMsgCount}>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800">{roleTitles[state.currentUser.role] || 'Module'}</h2>
          <p className="text-slate-500 text-sm mt-1">
            Connecté: <strong>{state.currentUser.name}</strong> ({state.currentUser.id}) — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <ModuleErrorBoundary onReset={handleLogout}>
          {renderModule()}
        </ModuleErrorBoundary>
      </Layout>
      {showMessaging && <Messaging state={state} setState={setState} onClose={() => setShowMessaging(false)} />}
    </>
  );
}
