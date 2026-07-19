import { useState } from 'react';
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

  if (view === 'reception') {
    return (
      <>
        <ReceptionModule state={state} setState={setState} onStaffLogin={() => setView('login')} onOpenMessaging={() => setShowMessaging(true)} />
        {showMessaging && <Messaging state={state} setState={setState} onClose={() => setShowMessaging(false)} />}
      </>
    );
  }

  if (view === 'login') {
    return <LoginScreen users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
  }

  if (!state.currentUser) { setView('reception'); return null; }

  // Vue « Dossier Médical » (accessible depuis n'importe quel module)
  if (view === 'medicalRecord') {
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
          <h2 className="text-2xl font-bold text-slate-800">{roleTitles[state.currentUser.role]}</h2>
          <p className="text-slate-500 text-sm mt-1">
            Connecté: <strong>{state.currentUser.name}</strong> ({state.currentUser.id}) — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {renderModule()}
      </Layout>
      {showMessaging && <Messaging state={state} setState={setState} onClose={() => setShowMessaging(false)} />}
    </>
  );
}
